import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteFrontstage, accError } from "../../_lib";

const ROUTE = "/api/accounting/contacts/[id]";
type Ctx = { params: Promise<{ id: string }> };

/** PATCH → แก้ไขผู้ติดต่อ */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth.role)) return accError("ไม่มีสิทธิ์แก้ไขข้อมูล", 403);

  const patch: Record<string, unknown> = {};
  if (body.kind !== undefined) {
    if (!["customer", "vendor", "both"].includes(String(body.kind)))
      return accError("ประเภทผู้ติดต่อไม่ถูกต้อง");
    patch.kind = body.kind;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return accError("กรุณากรอกชื่อผู้ติดต่อ");
    patch.name = name;
  }
  for (const f of ["tax_id", "branch", "address", "phone", "email"]) {
    if (body[f] !== undefined) patch[f] = (body[f] as string) || null;
  }
  if (Object.keys(patch).length === 0) return accError("ไม่มีข้อมูลที่จะแก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_contacts")
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

/** DELETE ?orgId= → ลบผู้ติดต่อ */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth.role)) return accError("ไม่มีสิทธิ์ลบข้อมูล", 403);

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { error } = await admin.from("acc_contacts").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
