/**
 * computeAdminInbox — "Action Inbox" ของ super admin
 *
 * รวมงานที่ต้อง "ลงมือ" จากทั้งระบบเป็นรายการเดียว จัดลำดับความสำคัญ + ผูก action
 * (เปิด Org 360 ผ่าน org_id หรือ นำทางผ่าน href) แทน banner เตือนนิ่ง ๆ บน dashboard
 *
 * แหล่งข้อมูล: organizations + org_billing (reuse isPlanExpired) + assistant_jobs (stuck STT)
 * ตัด org "พื้นที่ส่วนตัว" (personal_org_id) ออกจาก item การเงิน/maintenance — เน้นองค์กรธุรกิจ
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanExpired, type OrgBillingRow, type PlanTier } from "@/lib/billing";

export type InboxSeverity = "critical" | "warning" | "info";
export type InboxKind = "billing" | "maintenance" | "stt" | "api";

export interface InboxItem {
  id: string;
  severity: InboxSeverity;
  kind: InboxKind;
  title: string;
  detail?: string;
  /** ผูกกับองค์กร → คลิกเปิด Org 360 drawer */
  org_id?: string;
  /** ลิงก์ไปหน้าจัดการ (เมื่อไม่ผูก org เดียว) */
  href?: string;
}

const SEVERITY_RANK: Record<InboxSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** เกณฑ์ "งานค้าง" ของ STT (processing นานเกินไป = น่าจะค้าง) */
const STT_STUCK_MINUTES = 10;

export async function computeAdminInbox(admin: SupabaseClient): Promise<InboxItem[]> {
  const stuckBefore = new Date(Date.now() - STT_STUCK_MINUTES * 60_000).toISOString();

  const [orgsRes, billingRes, profilesRes, stuckRes] = await Promise.all([
    admin.from("organizations").select("id, name, maintenance_mode"),
    admin
      .from("org_billing")
      .select("org_id, plan_tier, plan_ends_at, trial_ends_at, payment_status"),
    admin.from("profiles").select("personal_org_id").not("personal_org_id", "is", null),
    admin
      .from("assistant_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("created_at", stuckBefore),
  ]);

  const orgs = (orgsRes.data ?? []) as { id: string; name: string; maintenance_mode: boolean }[];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  // org พื้นที่ส่วนตัว — ตัดออกจาก item ธุรกิจ
  const personalOrgIds = new Set(
    (profilesRes.data ?? [])
      .map((p) => (p as { personal_org_id?: string | null }).personal_org_id)
      .filter((id): id is string => !!id),
  );
  const isBusiness = (orgId: string) => !personalOrgIds.has(orgId);

  const items: InboxItem[] = [];

  // ── Billing: หมดอายุ / ค้างชำระ (เฉพาะองค์กรธุรกิจ) ──
  for (const b of billingRes.data ?? []) {
    const orgId = String((b as { org_id: string }).org_id);
    if (!isBusiness(orgId)) continue;
    const name = orgName.get(orgId) ?? orgId;
    const row: OrgBillingRow = {
      plan_tier: ((b as { plan_tier?: PlanTier }).plan_tier ?? "free") as PlanTier,
      plan_ends_at: (b as { plan_ends_at?: string }).plan_ends_at as string,
      trial_ends_at: (b as { trial_ends_at?: string }).trial_ends_at as string,
    };
    if (isPlanExpired(row)) {
      items.push({
        id: `billing-expired-${orgId}`,
        severity: "critical",
        kind: "billing",
        title: `${name} — plan หมดอายุ`,
        detail: "ต่ออายุหรือปรับแพ็กให้ลูกค้า",
        org_id: orgId,
      });
    }
    if ((b as { payment_status?: string }).payment_status === "overdue") {
      items.push({
        id: `billing-overdue-${orgId}`,
        severity: "warning",
        kind: "billing",
        title: `${name} — ค้างชำระ`,
        detail: "ติดตามการชำระเงิน",
        org_id: orgId,
      });
    }
  }

  // ── Maintenance mode เปิดค้าง (เฉพาะองค์กรธุรกิจ) ──
  for (const o of orgs) {
    if (o.maintenance_mode && isBusiness(o.id)) {
      items.push({
        id: `maintenance-${o.id}`,
        severity: "info",
        kind: "maintenance",
        title: `${o.name} — อยู่ใน Maintenance`,
        detail: "ปิดโหมดเมื่อพร้อมใช้งาน",
        org_id: o.id,
      });
    }
  }

  // ── STT jobs ค้าง (processing นานเกินเกณฑ์) ──
  const stuckCount = stuckRes.count ?? 0;
  if (stuckCount > 0) {
    items.push({
      id: "stt-stuck",
      severity: "warning",
      kind: "stt",
      title: `งานแกะเสียงค้าง ${stuckCount} งาน`,
      detail: `processing เกิน ${STT_STUCK_MINUTES} นาที — ตรวจ worker / requeue`,
      href: "/admin/stt-jobs",
    });
  }

  // จัดลำดับ: ร้ายแรงก่อน
  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return items;
}
