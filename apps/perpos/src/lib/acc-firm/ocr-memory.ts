/**
 * ocr-memory.ts — "ความจำ" ของ self-improvement loop ฝั่ง OCR (acc_firm)
 *
 * listVendorMappings : ผู้ขาย → บัญชีเดบิตที่ระบบจำไว้ (ocr_vendor_mappings + ชื่อบัญชี/ชื่อลูกค้า)
 * getFeedbackStats   : สถิติความแม่นยำจาก ocr_feedback_logs — "AI ถูกเลย" vs "คนต้องแก้"
 *                      (is_edited = คนแก้บรรทัด/บัญชีจากที่ AI เสนอ) + แยกรายเดือนให้เห็นเทรนด์
 *
 * Pattern acc_firm: caller (route) เช็ค auth + IDOR (clientOrgId ∈ active engagement) แล้ว
 * ส่ง admin client (service-role) เข้ามา — firm member ไม่ได้เป็นสมาชิก client org.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type VendorMapping = {
  id: string;
  client_org_id: string;
  client_name: string;
  vendor_name: string;
  vendor_tax_id: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  use_count: number;
  last_used_at: string;
};

export type FeedbackStats = {
  total: number;
  edited: number;
  accepted: number;
  /** % ที่ AI เสนอแล้วคนรับได้เลยโดยไม่แก้ */
  accuracy_pct: number;
  by_month: Array<{ month: string; total: number; edited: number; accuracy_pct: number }>;
};

function accuracy(total: number, edited: number): number {
  if (total === 0) return 0;
  return Math.round(((total - edited) / total) * 1000) / 10;
}

/** ผู้ขายที่ระบบจำได้ ของลูกค้าที่ระบุ (หรือทุกรายที่ส่งมา) เรียงตามใช้บ่อยสุด */
export async function listVendorMappings(
  admin: SupabaseClient,
  clientOrgIds: string[],
): Promise<VendorMapping[]> {
  if (clientOrgIds.length === 0) return [];

  const [{ data: rows, error }, { data: orgs }] = await Promise.all([
    admin
      .from("ocr_vendor_mappings")
      .select(
        "id, org_id, vendor_name, vendor_tax_id, use_count, last_used_at, debit_account_id, acc_accounts(code, name)",
      )
      .in("org_id", clientOrgIds)
      .order("use_count", { ascending: false })
      .order("last_used_at", { ascending: false }),
    admin.from("organizations").select("id, name").in("id", clientOrgIds),
  ]);

  if (error) throw new Error(error.message);

  const orgName = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]));

  return (rows ?? []).map((r) => {
    const acc = r.acc_accounts as { code?: string; name?: string } | null;
    return {
      id: r.id as string,
      client_org_id: r.org_id as string,
      client_name: orgName.get(r.org_id as string) ?? "ไม่ทราบชื่อลูกค้า",
      vendor_name: r.vendor_name as string,
      vendor_tax_id: (r.vendor_tax_id as string | null) ?? null,
      account_id: r.debit_account_id as string,
      account_code: acc?.code ?? "",
      account_name: acc?.name ?? "",
      use_count: (r.use_count as number) ?? 1,
      last_used_at: r.last_used_at as string,
    };
  });
}

/** สถิติ "AI ถูกเลย vs คนต้องแก้" จาก feedback log ของการอนุมัติที่ผ่านมา */
export async function getFeedbackStats(
  admin: SupabaseClient,
  clientOrgIds: string[],
): Promise<FeedbackStats> {
  const empty: FeedbackStats = { total: 0, edited: 0, accepted: 0, accuracy_pct: 0, by_month: [] };
  if (clientOrgIds.length === 0) return empty;

  const { data, error } = await admin
    .from("ocr_feedback_logs")
    .select("is_edited, created_at")
    .in("org_id", clientOrgIds)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return empty;

  const monthly = new Map<string, { total: number; edited: number }>();
  let edited = 0;

  for (const r of rows as Array<{ is_edited: boolean; created_at: string }>) {
    if (r.is_edited) edited += 1;
    const month = String(r.created_at).slice(0, 7); // YYYY-MM
    const m = monthly.get(month) ?? { total: 0, edited: 0 };
    m.total += 1;
    if (r.is_edited) m.edited += 1;
    monthly.set(month, m);
  }

  return {
    total: rows.length,
    edited,
    accepted: rows.length - edited,
    accuracy_pct: accuracy(rows.length, edited),
    by_month: Array.from(monthly.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 6)
      .map(([month, m]) => ({
        month,
        total: m.total,
        edited: m.edited,
        accuracy_pct: accuracy(m.total, m.edited),
      })),
  };
}
