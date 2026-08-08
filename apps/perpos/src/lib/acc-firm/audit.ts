/**
 * ร่องรอยการแก้บัญชีของลูกค้า — ฝั่งสำนักงานบัญชี (`/[firmSlug]/acc-firm/audit`)
 *
 * ดึงผ่าน RPC `acc_firm_audit_list` ซึ่งบังคับขอบเขตด้วย `acc_firm_has_client_access()`
 * ในตัว (ไม่ใช่ service-role ที่กรองเองทีหลัง) — ผู้เรียกที่ไม่ได้ดูแลลูกค้ารายนั้นได้ 0 แถว
 * เหตุที่ต้องเป็น RPC: หน้านี้ต้องโชว์ชื่อผู้ทำ แต่ `profiles` อ่านได้เฉพาะแถวตัวเอง
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type FirmAuditRow = {
  id: string;
  loggedAt: string;
  orgId: string;
  clientName: string;
  clientSlug: string;
  /** DML verb */
  action: "INSERT" | "UPDATE" | "DELETE";
  /** ชื่อการกระทำเชิงธุรกิจ — null = แถวที่มาจาก DML trigger (ไม่รู้เจตนา) */
  businessAction: string | null;
  tableName: string;
  recordId: string | null;
  actorName: string | null;
  /** ไม่ null = ทำในนามสำนักงาน (ไม่ใช่คนของลูกค้าเอง) */
  onBehalfOfOrgId: string | null;
  diffKeys: string[];
};

export type FirmAuditFilters = {
  clientOrgId?: string | null;
  from?: string | null;
  to?: string | null;
  /** true = เฉพาะแถวที่รู้เจตนา (business_action) */
  onlyBusiness?: boolean;
  page?: number;
  pageSize?: number;
};

export type FirmAuditPage = {
  rows: FirmAuditRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const FIRM_AUDIT_PAGE_SIZE = 25;

export async function listFirmAudit(
  rls: SupabaseClient,
  filters: FirmAuditFilters = {},
): Promise<FirmAuditPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? FIRM_AUDIT_PAGE_SIZE));

  const { data, error } = await rls.rpc("acc_firm_audit_list", {
    p_client_org_id: filters.clientOrgId || null,
    p_from: filters.from || null,
    // `to` จากตัวกรองเป็น "วันสุดท้ายที่ต้องการ" → ครอบทั้งวันด้วยการเลื่อนไปต้นวันถัดไป
    // (RPC เทียบแบบ `< p_to`) ไม่งั้นรายการของวันนั้นหายทั้งวัน
    p_to: filters.to ? nextDayIso(filters.to) : null,
    p_only_business: filters.onlyBusiness ?? false,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw new Error(`โหลดร่องรอยไม่สำเร็จ: ${error.message}`);

  const raw = (data ?? []) as Record<string, unknown>[];
  return {
    rows: raw.map((r) => ({
      id: String(r.id),
      loggedAt: String(r.logged_at),
      orgId: String(r.org_id),
      clientName: String(r.client_name ?? ""),
      clientSlug: String(r.client_slug ?? ""),
      action: String(r.action) as FirmAuditRow["action"],
      businessAction: (r.business_action as string | null) ?? null,
      tableName: String(r.table_name),
      recordId: (r.record_id as string | null) ?? null,
      actorName: (r.actor_name as string | null) ?? null,
      onBehalfOfOrgId: (r.on_behalf_of_org_id as string | null) ?? null,
      diffKeys: (r.diff_keys as string[] | null) ?? [],
    })),
    // total มาจาก window function ใน RPC — ไม่ใช่ความยาว array ที่ถูก limit ตัดไปแล้ว
    total: Number(raw[0]?.total_count ?? 0),
    page,
    pageSize,
  };
}

/** "YYYY-MM-DD" → ISO ของต้นวันถัดไป (ใช้ทำช่วงปลายแบบครอบทั้งวัน) */
function nextDayIso(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
