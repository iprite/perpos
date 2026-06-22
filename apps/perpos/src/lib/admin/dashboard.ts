/**
 * computeAdminDashboard — System-wide stats สำหรับ Super Admin Dashboard
 *
 * ดึง/คำนวณข้อมูลฝั่ง server (queries ขนานกันด้วย Promise.all) แล้วคืน DashboardData
 * เรียกจาก Server Component (hydrogen)/admin/page.tsx → fetch ตอน SSR (ไม่มี client round-trip)
 *
 * รับ admin client (service role, bypass RLS) เข้ามา — auth/role check เป็นหน้าที่ของ caller
 */

import {
  isPlanExpired,
  trialDaysRemaining,
  type PlanTier,
  type OrgBillingRow,
} from "@/lib/billing";
import { buildInboxItems, STT_STUCK_MINUTES, type InboxItem } from "@/lib/admin/inbox";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardData {
  computed_at: string;
  users: { total: number; active: number; line_linked: number; super_admins: number };
  orgs: { total: number; maintenance: number };
  billing: { tier_counts: Record<string, number>; expired: number; overdue: number };
  api: {
    requests_24h: number;
    errors_24h: number;
    error_rate_pct: number;
    /** Δ% เทียบ 24 ชม.ก่อนหน้า (null = ไม่มีข้อมูลงวดก่อน) */
    requests_delta_pct: number | null;
  };
  webhooks: { deliveries_7d: number; failed_7d: number; fail_rate_pct: number };
  health_grades: Record<string, number>;
  recent_orgs: { id: string; name: string; created_at: string }[];
  inbox: InboxItem[];
}

function grade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "F";
}

export async function computeAdminDashboard(admin: SupabaseClient): Promise<DashboardData> {
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const prev24hStart = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const sttStuckBefore = new Date(Date.now() - STT_STUCK_MINUTES * 60_000).toISOString();

  const [
    { data: orgs },
    { data: profiles },
    { data: billing },
    { data: metrics24h },
    { data: webhooks7d },
    { data: recentOrgs },
    { count: stuckSttCount },
    { count: prevDayRequests },
  ] = await Promise.all([
    admin.from("organizations").select("id, name, maintenance_mode, created_at"),
    admin.from("profiles").select("id, role, is_active, line_user_id, created_at, personal_org_id"),
    admin
      .from("org_billing")
      .select("org_id, plan_tier, plan_ends_at, trial_ends_at, payment_status"),
    admin
      .from("api_request_metrics")
      .select("org_id, status_code")
      .gte("logged_at", since24h)
      .limit(100_000),
    admin
      .from("webhook_delivery_logs")
      .select("success")
      .gte("delivered_at", since7d)
      .limit(50_000),
    admin
      .from("organizations")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("assistant_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("created_at", sttStuckBefore),
    // จำนวน request ของ "24 ชม.ก่อนหน้า" (48–24 ชม.ที่แล้ว) — count head เบา ไว้คิด Δ
    admin
      .from("api_request_metrics")
      .select("id", { count: "exact", head: true })
      .gte("logged_at", prev24hStart)
      .lt("logged_at", since24h),
  ]);

  // เซ็ต org "พื้นที่ส่วนตัว" (home org ของแต่ละคน) — แหล่งความจริง = profiles.personal_org_id
  const personalOrgIds = new Set(
    (profiles ?? [])
      .map((p) => (p as { personal_org_id?: string | null }).personal_org_id)
      .filter((id): id is string => !!id),
  );

  // ── Users ─────────────────────────────────────────────────────────────────
  const totalUsers = (profiles ?? []).length;
  const activeUsers = (profiles ?? []).filter((p) => p.is_active).length;
  const lineLinked = (profiles ?? []).filter((p) => !!p.line_user_id).length;
  const superAdmins = (profiles ?? []).filter((p) => p.role === "super_admin").length;

  // ── Orgs ──────────────────────────────────────────────────────────────────
  const totalOrgs = (orgs ?? []).length;
  const maintenanceOrgs = (orgs ?? []).filter(
    (o) => (o as { maintenance_mode: boolean }).maintenance_mode,
  ).length;

  // ── Billing ───────────────────────────────────────────────────────────────
  const billByOrg: Record<string, Record<string, unknown>> = {};
  for (const b of billing ?? []) {
    billByOrg[String(b.org_id)] = b as Record<string, unknown>;
  }

  const tierCounts: Record<string, number> = { free: 0, starter: 0, pro: 0, enterprise: 0 };
  let expiredCount = 0;
  let overdueCount = 0;

  for (const org of orgs ?? []) {
    const b = billByOrg[String((org as { id: string }).id)];
    const tier = (b?.plan_tier as PlanTier) ?? "free";
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    const row: OrgBillingRow = {
      plan_tier: tier,
      plan_ends_at: b?.plan_ends_at as string,
      trial_ends_at: b?.trial_ends_at as string,
    };
    if (isPlanExpired(row)) expiredCount++;
    if (b?.payment_status === "overdue") overdueCount++;
  }

  // ── API health (24h) ──────────────────────────────────────────────────────
  const totalRequests = (metrics24h ?? []).length;
  const errorRequests = (metrics24h ?? []).filter((m) => Number(m.status_code) >= 500).length;
  const errorRatePct =
    totalRequests > 0 ? Math.round((errorRequests / totalRequests) * 100 * 10) / 10 : 0;
  const prevReq = prevDayRequests ?? 0;
  const requestsDeltaPct =
    prevReq > 0 ? Math.round(((totalRequests - prevReq) / prevReq) * 100) : null;

  // Requests by org
  const reqByOrg: Record<string, number> = {};
  for (const m of metrics24h ?? []) {
    if (m.org_id) reqByOrg[m.org_id] = (reqByOrg[m.org_id] ?? 0) + 1;
  }

  // ── Webhooks (7d) ─────────────────────────────────────────────────────────
  const totalWebhooks = (webhooks7d ?? []).length;
  const failedWebhooks = (webhooks7d ?? []).filter((w) => !w.success).length;
  const webhookFailRate =
    totalWebhooks > 0 ? Math.round((failedWebhooks / totalWebhooks) * 100 * 10) / 10 : 0;

  // ── Health grade estimate per org (simplified) ────────────────────────────
  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const org of orgs ?? []) {
    const orgId = (org as { id: string }).id;
    const b = billByOrg[orgId];
    const tier: PlanTier = (b?.plan_tier as PlanTier) ?? "free";
    const row: OrgBillingRow = {
      plan_tier: tier,
      plan_ends_at: b?.plan_ends_at as string,
      trial_ends_at: b?.trial_ends_at as string,
    };

    let score = 100;
    if (isPlanExpired(row)) score -= 30;
    else if ((trialDaysRemaining(row) ?? Infinity) < 3) score -= 15;
    const orgReqs = reqByOrg[orgId] ?? 0;
    const orgErrors = (metrics24h ?? []).filter(
      (m) => m.org_id === orgId && Number(m.status_code) >= 500,
    ).length;
    const orgErrPct = orgReqs > 0 ? orgErrors / orgReqs : 0;
    if (orgErrPct > 0.1) score -= 20;
    else if (orgErrPct > 0.05) score -= 10;

    gradeCounts[grade(Math.max(0, score))]++;
  }

  // Action Inbox — สร้างจากข้อมูลที่ fetch ไว้แล้ว (ไม่ query ซ้ำ)
  const inbox = buildInboxItems({
    orgs: (orgs ?? []) as { id: string; name: string; maintenance_mode: boolean }[],
    billing: (billing ?? []) as {
      org_id: string;
      plan_tier?: string | null;
      plan_ends_at?: string | null;
      trial_ends_at?: string | null;
      payment_status?: string | null;
    }[],
    personalOrgIds,
    stuckSttCount: stuckSttCount ?? 0,
  });

  return {
    computed_at: new Date().toISOString(),
    users: {
      total: totalUsers,
      active: activeUsers,
      line_linked: lineLinked,
      super_admins: superAdmins,
    },
    orgs: { total: totalOrgs, maintenance: maintenanceOrgs },
    billing: { tier_counts: tierCounts, expired: expiredCount, overdue: overdueCount },
    api: {
      requests_24h: totalRequests,
      errors_24h: errorRequests,
      error_rate_pct: errorRatePct,
      requests_delta_pct: requestsDeltaPct,
    },
    webhooks: {
      deliveries_7d: totalWebhooks,
      failed_7d: failedWebhooks,
      fail_rate_pct: webhookFailRate,
    },
    health_grades: gradeCounts,
    recent_orgs: (recentOrgs ?? [])
      .filter((o) => !personalOrgIds.has((o as { id: string }).id))
      .slice(0, 5)
      .map((o) => ({
        id: (o as { id: string }).id,
        name: (o as { name: string }).name,
        created_at: (o as { created_at: string }).created_at,
      })),
    inbox,
  };
}
