import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, num, round2 } from "../../_lib";

const ROUTE = "/api/accounting/assets/[id]";
type Ctx = { params: Promise<{ id: string }> };

/** PATCH → แก้ไขสินทรัพย์ (accountant). cost/salvage/life แก้ได้ตราบใด accumulated ยังไม่เกิน. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role))
    return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการสินทรัพย์ได้", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_assets")
    .select("cost, salvage_value, accumulated_depreciation")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบสินทรัพย์", 404);
  const ex = existing as { cost: number; salvage_value: number; accumulated_depreciation: number };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return accError("กรุณากรอกชื่อสินทรัพย์");
    patch.name = name;
  }
  let cost = Number(ex.cost);
  let salvage = Number(ex.salvage_value);
  if (body.cost !== undefined) {
    cost = round2(num(body.cost, { nonNeg: true }));
    if (cost <= 0) return accError("ราคาทุนต้องมากกว่า 0");
    patch.cost = cost;
  }
  if (body.salvage_value !== undefined) {
    salvage = round2(num(body.salvage_value, { nonNeg: true }));
    patch.salvage_value = salvage;
  }
  if (salvage > cost) return accError("มูลค่าซากต้องไม่เกินราคาทุน");
  // CHECK ใน DB: accumulated ≤ cost − salvage → กันแก้จนผิด
  if (
    (body.cost !== undefined || body.salvage_value !== undefined) &&
    Number(ex.accumulated_depreciation) > cost - salvage
  ) {
    return accError("ราคาทุน/มูลค่าซากใหม่ ทำให้ค่าเสื่อมสะสมเกินมูลค่าที่คิดได้", 409);
  }
  if (body.useful_life_months !== undefined) {
    const life = num(body.useful_life_months);
    if (life <= 0) return accError("อายุการใช้งาน (เดือน) ต้องมากกว่า 0");
    patch.useful_life_months = life;
  }
  if (body.status !== undefined) {
    if (!["active", "disposed"].includes(String(body.status))) return accError("สถานะไม่ถูกต้อง");
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) return accError("ไม่มีข้อมูลที่จะแก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_assets")
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
