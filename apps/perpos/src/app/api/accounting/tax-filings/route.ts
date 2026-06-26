import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, orgIdFromQuery, num } from "../_lib";
import { listTaxFilings } from "@/lib/accounting/tax-filings";

const ROUTE = "/api/accounting/tax-filings";
const VALID_KIND = ["pp30", "pnd1", "pnd3", "pnd53"];

/** GET ?orgId=&taxKind=&status=&year= → แบบภาษี */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listTaxFilings(auth.rls, orgId, {
      taxKind: p.get("taxKind") ?? undefined,
      status: p.get("status") ?? undefined,
      year: p.get("year") ? Number(p.get("year")) : undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ filings: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้างแบบภาษี (accountant). due_date คำนวณ = วันที่ 7 เดือนถัดไป ถ้าไม่ส่งมา. */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการภาษีได้", 403);

  const taxKind = String(body.tax_kind ?? "");
  if (!VALID_KIND.includes(taxKind)) return accError("ชนิดแบบภาษีไม่ถูกต้อง");
  const periodYear = num(body.period_year);
  const periodMonth = num(body.period_month);
  if (periodYear < 2000 || periodMonth < 1 || periodMonth > 12)
    return accError("งวดภาษีไม่ถูกต้อง");

  let dueDate = String(body.due_date ?? "");
  if (!dueDate) {
    let dy = periodYear;
    let dm = periodMonth + 1;
    if (dm > 12) {
      dm = 1;
      dy += 1;
    }
    dueDate = `${dy}-${String(dm).padStart(2, "0")}-07`;
  }

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_tax_filings")
    .insert({
      org_id: orgId,
      tax_kind: taxKind,
      period_year: periodYear,
      period_month: periodMonth,
      status: "draft",
      sales_vat: body.sales_vat !== undefined ? num(body.sales_vat) : null,
      purchase_vat: body.purchase_vat !== undefined ? num(body.purchase_vat) : null,
      net_payable: body.net_payable !== undefined ? num(body.net_payable) : null,
      wht_total: body.wht_total !== undefined ? num(body.wht_total) : null,
      due_date: dueDate,
      created_by: auth.userId,
    })
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    if ((error as { code?: string }).code === "23505")
      return accError("แบบภาษีชนิดนี้ของงวดนี้มีอยู่แล้ว");
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
