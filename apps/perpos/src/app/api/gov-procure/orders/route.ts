import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import {
  requireGovProcureMember,
  canWrite,
  orgIdFromQuery,
  govError,
  sanitizeOrderPayload,
} from "../_lib";
import { listOrders } from "@/lib/gov-procure/orders";

// GET /api/gov-procure/orders?orgId=... → list (order by seq_no)
export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const orders = await listOrders(createAdminClient(), orgId);
    return NextResponse.json({ orders });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

// POST /api/gov-procure/orders?orgId=... → สร้างงานใหม่ (canWrite)
export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์สร้างงาน", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
  if (!customerName) return govError("กรุณาระบุชื่อหน่วยงาน (customer_name)");

  // sanitize allowlist + finance-lock ต่อ role (staff ตัด field การเงินทิ้ง)
  const payload = sanitizeOrderPayload(body, auth.role);
  payload.customer_name = customerName;

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  const { data, error } = await admin
    .from("gov_procure_orders")
    .insert({ ...payload, org_id: orgId, created_by: auth.userId })
    .select()
    .single();

  if (error) return govError(error.message, 500);
  return NextResponse.json({ order: data }, { status: 201 });
}
