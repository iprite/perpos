import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, round2 } from "../../../_lib";

const ROUTE = "/api/accounting/tax-filings/[id]/recompute";
type Ctx = { params: Promise<{ id: string }> };

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/**
 * POST → คำนวณยอดภาษีของแบบใหม่จากข้อมูลจริง (accountant).
 *   pp30: sales_vat = Σ documents.vat_amount (vat_enabled, งวดนั้น) · purchase_vat = Σ entries(expense).wht? (จาก vat ซื้อ — เก็บใน entries ไม่มี → 0 ตอนนี้)
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
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการภาษีได้", 403);

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
      .select("vat_amount")
      .eq("org_id", orgId)
      .eq("vat_enabled", true)
      .neq("status", "void")
      .gte("issue_date", from)
      .lte("issue_date", to);
    const salesVat = round2(
      (docs ?? []).reduce((s, d) => s + (Number((d as { vat_amount: number }).vat_amount) || 0), 0),
    );
    // sales_vat = auto (จากเอกสารขาย VAT งวดนั้น) · purchase_vat = คงค่าที่นักบัญชีกรอกเอง
    // (โมเดลนี้ไม่ได้เก็บภาษีซื้อจากค่าใช้จ่าย → derive อัตโนมัติไม่ได้, ไม่ทับค่าที่กรอกไว้)
    const purchaseVat = round2(Number(f.purchase_vat) || 0);
    patch.sales_vat = salesVat;
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
