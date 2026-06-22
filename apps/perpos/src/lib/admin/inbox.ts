/**
 * buildInboxItems — "Action Inbox" ของ super admin (pure — ไม่ fetch เอง)
 *
 * รวมงานที่ต้อง "ลงมือ" จากทั้งระบบเป็นรายการเดียว จัดลำดับความสำคัญ + ผูก action
 * (เปิด Org 360 ผ่าน org_id หรือ นำทางผ่าน href) แทน banner เตือนนิ่ง ๆ บน dashboard
 *
 * รับข้อมูลดิบที่ computeAdminDashboard fetch อยู่แล้ว (organizations/org_billing/profiles)
 * + จำนวน STT job ค้าง → ไม่ query ซ้ำ · ตัด org "พื้นที่ส่วนตัว" ออกจาก item ธุรกิจ
 */

import { isPlanExpired, type OrgBillingRow, type PlanTier } from "@/lib/billing";

export interface InboxOrgRow {
  id: string;
  name: string;
  maintenance_mode: boolean;
}
export interface InboxBillingRow {
  org_id: string;
  plan_tier?: string | null;
  plan_ends_at?: string | null;
  trial_ends_at?: string | null;
  payment_status?: string | null;
}

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
export const STT_STUCK_MINUTES = 10;

export function buildInboxItems(input: {
  orgs: InboxOrgRow[];
  billing: InboxBillingRow[];
  personalOrgIds: Set<string>;
  stuckSttCount: number;
}): InboxItem[] {
  const { orgs, billing, personalOrgIds, stuckSttCount } = input;
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const isBusiness = (orgId: string) => !personalOrgIds.has(orgId);

  const items: InboxItem[] = [];

  // ── Billing: หมดอายุ / ค้างชำระ (เฉพาะองค์กรธุรกิจ) ──
  for (const b of billing) {
    const orgId = String(b.org_id);
    if (!isBusiness(orgId)) continue;
    const name = orgName.get(orgId) ?? orgId;
    const row: OrgBillingRow = {
      plan_tier: (b.plan_tier ?? "free") as PlanTier,
      plan_ends_at: b.plan_ends_at as string,
      trial_ends_at: b.trial_ends_at as string,
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
    if (b.payment_status === "overdue") {
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
  if (stuckSttCount > 0) {
    items.push({
      id: "stt-stuck",
      severity: "warning",
      kind: "stt",
      title: `งานแกะเสียงค้าง ${stuckSttCount} งาน`,
      detail: `processing เกิน ${STT_STUCK_MINUTES} นาที — ตรวจ worker / requeue`,
      href: "/admin/stt-jobs",
    });
  }

  // จัดลำดับ: ร้ายแรงก่อน
  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return items;
}
