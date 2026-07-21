import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import {
  requireGovProcureMember,
  canWrite,
  canDelete,
  orgIdFromQuery,
  govError,
  sanitizeOrderPayload,
} from "../../_lib";
import { getOrder } from "@/lib/gov-procure/orders";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/gov-procure/orders/[id]?orgId=... → single order
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const order = await getOrder(createAdminClient(), orgId, id);
    if (!order) return govError("ไม่พบงาน", 404);
    return NextResponse.json({ order });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

// PUT /api/gov-procure/orders/[id]?orgId=... → แก้ order (canWrite + finance-lock ต่อ role)
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์แก้ไขงาน", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Q4 finance-lock: staff ส่ง field การเงินมา → ถูกตัดทิ้งเงียบ ๆ ที่นี่
  const payload = sanitizeOrderPayload(body, auth.role);
  if (Object.keys(payload).length === 0) {
    return govError("ไม่มีข้อมูลที่แก้ไขได้");
  }

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  const { data, error } = await admin
    .from("gov_procure_orders")
    .update(payload)
    .eq("id", id)
    .eq("org_id", orgId) // org isolation
    .select()
    .single();

  if (error) return govError(error.message, 500);
  if (!data) return govError("ไม่พบงาน", 404);
  return NextResponse.json({ order: data });
}

// DELETE /api/gov-procure/orders/[id]?orgId=... → ลบ (owner/manager เท่านั้น — staff ห้ามลบ)
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canDelete(auth.role)) return govError("ไม่มีสิทธิ์ลบงาน (เฉพาะเจ้าของ/ผู้จัดการ)", 403);

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  const { error } = await admin
    .from("gov_procure_orders")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return govError(error.message, 500);
  return NextResponse.json({ ok: true });
}
