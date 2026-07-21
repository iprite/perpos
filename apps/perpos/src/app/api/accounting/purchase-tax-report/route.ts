import { NextRequest, NextResponse } from "next/server";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, accError, orgIdFromQuery } from "../_lib";
import { getPurchaseTaxReport } from "@/lib/accounting/purchase-tax-report";

const ROUTE = "/api/accounting/purchase-tax-report";

/** GET ?orgId=&year=&month= → รายงานภาษีซื้อของงวดภาษีนั้น (ประกาศอธิบดีฯ ฉบับที่ 89) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  const year = Number(p.get("year"));
  const month = Number(p.get("month"));
  if (!year || !(month >= 1 && month <= 12))
    return accError("ระบุงวดภาษี (year, month) ให้ถูกต้อง");

  try {
    const report = await getPurchaseTaxReport(auth.rls, orgId, year, month);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json(report);
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}
