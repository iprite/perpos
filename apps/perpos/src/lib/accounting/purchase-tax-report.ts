/**
 * purchase-tax-report.ts — รายงานภาษีซื้อ (แบบที่ใช้ยื่น/แนบ ภ.พ.30)
 *
 * ตามประกาศอธิบดีฯ (ฉบับที่ 89) รายงานภาษีซื้อต้องมีอย่างน้อย:
 *   ลำดับ · วัน เดือน ปี ของใบกำกับ · เลขที่ใบกำกับ · ชื่อผู้ขาย · เลขประจำตัวผู้เสียภาษี
 *   · สาขา · มูลค่าสินค้า/บริการ · จำนวนภาษีมูลค่าเพิ่ม
 *
 * จัดกลุ่มตาม "งวดภาษี" (tax_year/tax_month) ไม่ใช่ issue_date — ม.82/3 ให้เลื่อนใช้ได้
 * แยกยอดที่เครดิตได้ / เครดิตไม่ได้ ให้เห็นชัด (ยอดที่เข้า ภ.พ.30 = เฉพาะที่เครดิตได้)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccPurchaseDocType } from "./types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PurchaseTaxReportRow {
  seq: number;
  id: string;
  issue_date: string;
  doc_number: string;
  doc_type: AccPurchaseDocType;
  seller_name: string | null;
  seller_tax_id: string | null;
  seller_branch: string | null;
  subtotal: number;
  vat_amount: number;
  is_vat_claimable: boolean;
  non_claimable_note: string | null;
  /** ใบลดหนี้ = ยอดติดลบในรายงาน (ลดภาษีซื้อ) */
  signed_subtotal: number;
  signed_vat: number;
}

export interface PurchaseTaxReport {
  period: { year: number; month: number };
  rows: PurchaseTaxReportRow[];
  /** ยอดที่นำไปเครดิตใน ภ.พ.30 ได้จริง */
  claimable_subtotal: number;
  claimable_vat: number;
  /** ยอดที่บันทึกไว้แต่เครดิตไม่ได้ (ภาษีซื้อต้องห้าม / ใบกำกับอย่างย่อ / ใบเสร็จ) */
  non_claimable_subtotal: number;
  non_claimable_vat: number;
  total_subtotal: number;
  total_vat: number;
  count: number;
}

/** ดึงรายงานภาษีซื้อของงวดภาษีหนึ่ง (เรียงตามวันที่บนใบกำกับ) */
export async function getPurchaseTaxReport(
  db: SupabaseClient,
  orgId: string,
  year: number,
  month: number,
): Promise<PurchaseTaxReport> {
  const { data, error } = await db
    .from("acc_purchase_documents")
    .select(
      "id, issue_date, doc_number, doc_type, seller_name, seller_tax_id, seller_branch, subtotal, vat_amount, is_vat_claimable, non_claimable_note",
    )
    .eq("org_id", orgId)
    .eq("tax_year", year)
    .eq("tax_month", month)
    .neq("status", "void")
    .order("issue_date", { ascending: true })
    .order("doc_number", { ascending: true });
  if (error) throw new Error(error.message);

  const rows: PurchaseTaxReportRow[] = (data ?? []).map((r, i) => {
    const row = r as Omit<PurchaseTaxReportRow, "seq" | "signed_subtotal" | "signed_vat">;
    // ใบลดหนี้จากผู้ขาย = ลดภาษีซื้อ → แสดงเป็นยอดลบ
    const sign = row.doc_type === "credit_note" ? -1 : 1;
    return {
      ...row,
      seq: i + 1,
      subtotal: Number(row.subtotal) || 0,
      vat_amount: Number(row.vat_amount) || 0,
      signed_subtotal: round2(sign * (Number(row.subtotal) || 0)),
      signed_vat: round2(sign * (Number(row.vat_amount) || 0)),
    };
  });

  const claimable = rows.filter((r) => r.is_vat_claimable);
  const nonClaimable = rows.filter((r) => !r.is_vat_claimable);
  const sum = (arr: PurchaseTaxReportRow[], k: "signed_subtotal" | "signed_vat") =>
    round2(arr.reduce((s, r) => s + r[k], 0));

  return {
    period: { year, month },
    rows,
    claimable_subtotal: sum(claimable, "signed_subtotal"),
    claimable_vat: sum(claimable, "signed_vat"),
    non_claimable_subtotal: sum(nonClaimable, "signed_subtotal"),
    non_claimable_vat: sum(nonClaimable, "signed_vat"),
    total_subtotal: sum(rows, "signed_subtotal"),
    total_vat: sum(rows, "signed_vat"),
    count: rows.length,
  };
}
