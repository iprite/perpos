import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteFrontstage, accError, num } from "../../_lib";

const ROUTE = "/api/accounting/products/[id]";
type Ctx = { params: Promise<{ id: string }> };

/** PATCH → แก้ไขสินค้า/บริการ */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์แก้ไขข้อมูล", 403);

  const patch: Record<string, unknown> = {};
  if (body.kind !== undefined) {
    if (!["good", "service"].includes(String(body.kind))) return accError("ประเภทไม่ถูกต้อง");
    patch.kind = body.kind;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return accError("กรุณากรอกชื่อสินค้า/บริการ");
    patch.name = name;
  }
  if (body.code !== undefined) patch.code = (body.code as string) || null;
  if (body.unit !== undefined) patch.unit = (body.unit as string) || null;
  if (body.unit_price !== undefined) patch.unit_price = num(body.unit_price, { nonNeg: true });
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  if (body.description !== undefined) patch.description = (body.description as string) || null;
  if (Object.keys(patch).length === 0) return accError("ไม่มีข้อมูลที่จะแก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_products")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    if ((error as { code?: string }).code === "23505") return accError("รหัสสินค้านี้มีอยู่แล้ว");
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}

/** DELETE ?orgId= → ลบสินค้า/บริการ */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์ลบข้อมูล", 403);

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { error } = await admin.from("acc_products").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
