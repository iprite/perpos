import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, round2 } from "../../../_lib";

const ROUTE = "/api/accounting/tax-filings/[id]/recompute";
type Ctx = { params: Promise<{ id: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// ฐานภาษีขายของ ภ.พ.30 = "ใบกำกับภาษี" เท่านั้น
//
// ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จรับเงิน / ใบวางบิล / ใบส่งของ ไม่ใช่ใบกำกับภาษี
// จึงไม่ใช่ฐานภาษีขาย — เดิมโค้ดนี้ไม่กรอง doc_type เลย ดีลเดียวที่ออก
// ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ จึงถูกนับ VAT ซ้ำ 3 รอบ (ยอดภาษีขายเกินจริง)
//
// ใบเพิ่มหนี้ (ม.86/9) = เพิ่มภาษีขาย · ใบลดหนี้ (ม.86/10) = ลดภาษีขาย → ต้องหักออก
// ─────────────────────────────────────────────────────────────────────────────
const PP30_OUTPUT_VAT_ADD = ["tax_invoice", "receipt_tax_invoice", "debit_note"] as const;
const PP30_OUTPUT_VAT_SUBTRACT = ["credit_note"] as const;
const PP30_OUTPUT_VAT_DOC_TYPES: string[] = [...PP30_OUTPUT_VAT_ADD, ...PP30_OUTPUT_VAT_SUBTRACT];

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/**
 * POST → คำนวณยอดภาษีของแบบใหม่จากข้อมูลจริง (accountant).
 *   pp30: sales_vat = Σ vat_amount ของ "ใบกำกับภาษี" ในงวด (ใบกำกับ/ใบเสร็จ-ใบกำกับ/ใบเพิ่มหนี้ บวก · ใบลดหนี้ ลบ)
 *         purchase_vat = คงค่าที่นักบัญชีกรอกเอง (โมเดลนี้ยังไม่เก็บใบกำกับภาษีซื้อ → derive ไม่ได้)
 *   pnd*: wht_total = Σ entries.wht_amount ของงวด (expense, wht_amount>0).
 * filed แล้ว recompute ไม่ได้.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการภาษีได้", 403);

  const admin = createAdminClient();
  const { data: filing } = await admin
    .from("acc_tax_filings")
    .select("tax_kind, period_year, period_month, status, purchase_vat")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!filing) return accError("ไม่พบแบบภาษี", 404);
  const f = filing as {
    tax_kind: string;
    period_year: number;
    period_month: number;
    status: string;
    purchase_vat: number | null;
  };
  if (f.status === "filed") return accError("แบบภาษีที่ยื่นแล้ว คำนวณใหม่ไม่ได้", 409);

  const { from, to } = monthRange(f.period_year, f.period_month);
  const patch: Record<string, unknown> = {};

  if (f.tax_kind === "pp30") {
    const { data: docs } = await admin
      .from("acc_documents")
      .select("doc_type, vat_amount")
      .eq("org_id", orgId)
      .eq("vat_enabled", true)
      .in("doc_type", PP30_OUTPUT_VAT_DOC_TYPES)
      .neq("status", "void")
      .gte("issue_date", from)
      .lte("issue_date", to);
    const salesVat = round2(
      (docs ?? []).reduce((s, row) => {
        const d = row as { doc_type: string; vat_amount: number };
        const vat = Number(d.vat_amount) || 0;
        // ใบลดหนี้หักออกจากภาษีขาย (ม.86/10) · ที่เหลือบวกเข้า
        const sign = (PP30_OUTPUT_VAT_SUBTRACT as readonly string[]).includes(d.doc_type) ? -1 : 1;
        return s + sign * vat;
      }, 0),
    );
    // ── ภาษีซื้อ: จากทะเบียนใบกำกับภาษีซื้อ (acc_purchase_documents) ──
    // กรองด้วย "งวดภาษี" (tax_year/tax_month) ไม่ใช่ issue_date เพราะ ม.82/3 ให้เลื่อน
    // ใช้ภาษีซื้อได้ภายใน 6 เดือน · นับเฉพาะใบที่เครดิตได้ (is_vat_claimable)
    // ใบลดหนี้จากผู้ขาย = ลดภาษีซื้อ → หักออก
    const { data: purchases } = await admin
      .from("acc_purchase_documents")
      .select("doc_type, vat_amount")
      .eq("org_id", orgId)
      .eq("is_vat_claimable", true)
      .neq("status", "void")
      .eq("tax_year", f.period_year)
      .eq("tax_month", f.period_month);

    const hasPurchaseRegistry = (purchases ?? []).length > 0;
    const derivedPurchaseVat = round2(
      (purchases ?? []).reduce((s, row) => {
        const d = row as { doc_type: string; vat_amount: number };
        const vat = Number(d.vat_amount) || 0;
        return s + (d.doc_type === "credit_note" ? -vat : vat);
      }, 0),
    );

    // ถ้ายังไม่มีใบกำกับซื้อในงวดเลย = org นั้นยังไม่ได้ใช้ทะเบียนซื้อ
    // → คงค่าที่นักบัญชีกรอกมือไว้ (ไม่ทับเป็น 0 ซึ่งจะทำให้ยอดที่กรอกไว้หาย)
    const purchaseVat = hasPurchaseRegistry
      ? derivedPurchaseVat
      : round2(Number(f.purchase_vat) || 0);

    patch.sales_vat = salesVat;
    patch.purchase_vat = purchaseVat;
    patch.net_payable = round2(salesVat - purchaseVat);
  } else {
    // pnd1/3/53 — wht_total จาก entries (expense, wht_amount>0) งวดนั้น
    const { data: entries } = await admin
      .from("acc_entries")
      .select("wht_amount")
      .eq("org_id", orgId)
      .eq("kind", "expense")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .not("wht_amount", "is", null);
    const whtTotal = round2(
      (entries ?? []).reduce(
        (s, e) => s + (Number((e as { wht_amount: number }).wht_amount) || 0),
        0,
      ),
    );
    patch.wht_total = whtTotal;
  }

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_tax_filings")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
