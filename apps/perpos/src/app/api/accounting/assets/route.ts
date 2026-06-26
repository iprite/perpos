import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteBackstage,
  accError,
  orgIdFromQuery,
  num,
  round2,
} from "../_lib";
import { listAssets } from "@/lib/accounting/assets";

const ROUTE = "/api/accounting/assets";

/** GET ?orgId=&status= → ทะเบียนสินทรัพย์ */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const data = await listAssets(auth.rls, orgId, {
      status: req.nextUrl.searchParams.get("status") ?? undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ assets: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → สร้างสินทรัพย์ (accountant) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role))
    return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการสินทรัพย์ได้", 403);

  const name = String(body.name ?? "").trim();
  if (!name) return accError("กรุณากรอกชื่อสินทรัพย์");
  const assetAccountId = String(body.asset_account_id ?? "");
  if (!assetAccountId) return accError("กรุณาเลือกบัญชีสินทรัพย์");
  const acquireDate = String(body.acquire_date ?? "");
  if (!acquireDate) return accError("กรุณาเลือกวันที่ได้มา");
  const cost = round2(num(body.cost, { nonNeg: true }));
  if (cost <= 0) return accError("ราคาทุนต้องมากกว่า 0");
  const salvage = round2(num(body.salvage_value, { nonNeg: true }));
  if (salvage > cost) return accError("มูลค่าซากต้องไม่เกินราคาทุน");
  const life = num(body.useful_life_months);
  if (life <= 0) return accError("อายุการใช้งาน (เดือน) ต้องมากกว่า 0");

  const admin = createAdminClient();
  // ยืนยันบัญชีสินทรัพย์อยู่ org เดียวกัน
  const { data: acct } = await admin
    .from("acc_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", assetAccountId)
    .maybeSingle();
  if (!acct) return accError("บัญชีสินทรัพย์ไม่ถูกต้อง");

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_assets")
    .insert({
      org_id: orgId,
      name,
      asset_account_id: assetAccountId,
      acquire_date: acquireDate,
      cost,
      salvage_value: salvage,
      useful_life_months: life,
      depreciation_method: "straight_line",
      accumulated_depreciation: 0,
      status: "active",
      created_by: auth.userId,
    })
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
