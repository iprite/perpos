import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canClosePeriod, accError, orgIdFromQuery, num } from "../_lib";
import { listPeriods } from "@/lib/accounting/periods";

const ROUTE = "/api/accounting/periods";

/** GET ?orgId=&year= → งวดบัญชี */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const yearStr = req.nextUrl.searchParams.get("year");
  try {
    const data = await listPeriods(auth.rls, orgId, {
      year: yearStr ? Number(yearStr) : undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ periods: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้างงวด (open) ถ้ายังไม่มี (accountant). idempotent ผ่าน unique(org,year,month). */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canClosePeriod(auth.role)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการงวดบัญชีได้", 403);

  const year = num(body.year);
  const month = num(body.month);
  if (year < 2000 || month < 1 || month > 12) return accError("ปี/เดือนไม่ถูกต้อง");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_periods")
    .upsert(
      { org_id: orgId, year, month, status: "open" },
      { onConflict: "org_id,year,month", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data ?? { ok: true }, { status: 201 });
}
