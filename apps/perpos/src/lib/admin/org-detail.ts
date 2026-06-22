/**
 * computeOrgDetail — รวมข้อมูล "1 องค์กร" สำหรับ Org 360° Drawer (super admin)
 *
 * รวมทุกอย่างที่เดิมกระจายตามหน้า admin (health/billing/modules/members/audit)
 * ไว้ในการเรียกครั้งเดียว เพื่อให้ drawer เปิดจากที่ไหนก็ได้แล้วเห็นครบ
 *
 * reuse: computeOrgHealth (health.ts) · @/lib/billing helpers · ALL_MODULES (labels)
 * รับ admin client (service role) — auth/role check เป็นหน้าที่ของ caller (requireSuperAdmin*)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOrgHealth, type Grade } from "@/lib/admin/health";
import {
  isPlanExpired,
  trialDaysRemaining,
  type OrgBillingRow,
  type PlanTier,
} from "@/lib/billing";
import { ALL_MODULES } from "@/lib/modules";

export interface OrgDetailMember {
  user_id: string;
  email: string;
  role: string;
  is_active: boolean;
  line_connected: boolean;
}

export interface OrgDetail {
  org: {
    id: string;
    name: string;
    slug: string | null;
    maintenance_mode: boolean;
    created_at: string | null;
  };
  billing: {
    plan_tier: PlanTier;
    payment_status: string | null;
    monthly_price: number | null;
    currency: string;
    plan_ends_at: string | null;
    trial_ends_at: string | null;
    is_expired: boolean;
    trial_days_remaining: number | null;
  } | null;
  health: { score: number; grade: Grade } | null;
  members: OrgDetailMember[];
  modules: { key: string; label: string; is_enabled: boolean }[];
  api_7d: { date: string; requests: number; errors: number }[];
  recent_audit: {
    action: string;
    actor_email: string | null;
    target_label: string | null;
    created_at: string;
  }[];
  computed_at: string;
}

export async function computeOrgDetail(
  admin: SupabaseClient,
  orgId: string,
): Promise<OrgDetail | null> {
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [orgRes, billingRes, membersRes, moduleRes, metricsRes, auditRes, healthAll] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id, name, slug, maintenance_mode, created_at")
        .eq("id", orgId)
        .maybeSingle(),
      admin.from("org_billing").select("*").eq("org_id", orgId).maybeSingle(),
      admin
        .from("organization_members")
        .select("user_id, role, profiles(email, is_active, line_user_id)")
        .eq("organization_id", orgId),
      admin
        .from("org_module_settings")
        .select("module_key, is_enabled")
        .eq("organization_id", orgId),
      admin
        .from("api_request_metrics")
        .select("status_code, logged_at")
        .eq("org_id", orgId)
        .gte("logged_at", since7d)
        .limit(50_000),
      admin
        .from("admin_audit_log")
        .select("action, actor_email, target_label, created_at")
        .eq("target_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      computeOrgHealth(admin),
    ]);

  const org = orgRes.data as {
    id: string;
    name: string;
    slug: string | null;
    maintenance_mode: boolean;
    created_at: string | null;
  } | null;
  if (!org) return null;

  // ── Billing ──
  const b = billingRes.data as Record<string, unknown> | null;
  let billing: OrgDetail["billing"] = null;
  if (b) {
    const row: OrgBillingRow = {
      plan_tier: (b.plan_tier as PlanTier) ?? "free",
      plan_ends_at: b.plan_ends_at as string,
      trial_ends_at: b.trial_ends_at as string,
    };
    billing = {
      plan_tier: row.plan_tier,
      payment_status: (b.payment_status as string) ?? null,
      monthly_price: (b.monthly_price as number) ?? null,
      currency: (b.currency as string) ?? "THB",
      plan_ends_at: (b.plan_ends_at as string) ?? null,
      trial_ends_at: (b.trial_ends_at as string) ?? null,
      is_expired: isPlanExpired(row),
      trial_days_remaining: trialDaysRemaining(row),
    };
  }

  // ── Health (reuse computeOrgHealth, filter 1 org) ──
  const h = healthAll.find((x) => x.org_id === orgId);
  const health = h ? { score: h.health_score, grade: h.grade } : null;

  // ── Members ──
  const members: OrgDetailMember[] = (membersRes.data ?? []).map((m: Record<string, unknown>) => {
    const p = (m.profiles ?? {}) as Record<string, unknown>;
    return {
      user_id: String(m.user_id),
      email: String(p.email ?? ""),
      role: String(m.role ?? ""),
      is_active: Boolean(p.is_active),
      line_connected: !!p.line_user_id,
    };
  });

  // ── Modules (enabled set + labels จาก ALL_MODULES) ──
  const enabled = new Set(
    (moduleRes.data ?? [])
      .filter((r: Record<string, unknown>) => r.is_enabled)
      .map((r: Record<string, unknown>) => String(r.module_key)),
  );
  const modules = ALL_MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    is_enabled: enabled.has(m.key),
  })).filter((m) => m.is_enabled);

  // ── API usage 7 วัน (รายวัน — สำหรับ sparkline) ──
  const byDay: Record<string, { requests: number; errors: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDay[d] = { requests: 0, errors: 0 };
  }
  for (const m of metricsRes.data ?? []) {
    const day = String((m as { logged_at: string }).logged_at).slice(0, 10);
    if (!byDay[day]) continue;
    byDay[day].requests += 1;
    if (Number((m as { status_code: number }).status_code) >= 500) byDay[day].errors += 1;
  }
  const api_7d = Object.entries(byDay).map(([date, v]) => ({ date, ...v }));

  // ── Recent audit ──
  const recent_audit = (auditRes.data ?? []).map((a: Record<string, unknown>) => ({
    action: String(a.action ?? ""),
    actor_email: (a.actor_email as string) ?? null,
    target_label: (a.target_label as string) ?? null,
    created_at: String(a.created_at ?? ""),
  }));

  return {
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      maintenance_mode: org.maintenance_mode,
      created_at: org.created_at,
    },
    billing,
    health,
    members,
    modules,
    api_7d,
    recent_audit,
    computed_at: new Date().toISOString(),
  };
}
