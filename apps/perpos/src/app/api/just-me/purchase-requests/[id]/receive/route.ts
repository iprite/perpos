/**
 * /api/just-me/purchase-requests/[id]/receive — รับของเข้าคลัง
 * cost-access + สิทธิ์เขียน · **ทางเดียวของการรับของตามใบขอซื้อ**
 *
 * ⛔ ทุกอย่างเกิดใน `receivePurchaseRequest()` (lib/just-me/purchasing.ts) ที่เดียว:
 *    สร้าง movement `receive` → บวกยอดคลัง → บวก `received_qty` → คิดสถานะใบจากข้อมูลใน DB
 *    route นี้ทำแค่ด่านสิทธิ์ + audit + แปลง error เป็นข้อความไทย
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError } from "../../../_lib";
import { receivePurchaseRequest, type ReceiveLineInput } from "@/lib/just-me/purchasing";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lines = Array.isArray(body.lines) ? (body.lines as ReceiveLineInput[]) : [];
  if (lines.length === 0) return jmError("ยังไม่ได้ระบุรายการที่รับของ", 400);

  const warehouseId = typeof body.warehouse_id === "string" ? body.warehouse_id : null;
  const refErr = await assertOrgRefs(g.orgId, [
    { value: warehouseId, table: "just_me_warehouses", label: "คลังปลายทาง" },
  ]);
  if (refErr) return jmError(refErr, 400);

  await auditMutation(req, g.auth);
  const res = await receivePurchaseRequest(createAdminClient(), {
    orgId: g.orgId,
    prId: id,
    userId: g.auth.userId,
    warehouseId,
    lines,
    note: typeof body.note === "string" ? body.note : null,
    clientToken: typeof body.clientToken === "string" ? body.clientToken : null,
  });
  if (!res.ok) return jmError(res.error, res.status);

  return NextResponse.json(res.result, { status: 201 });
}
