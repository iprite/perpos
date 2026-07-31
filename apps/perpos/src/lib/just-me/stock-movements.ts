/**
 * stock-movements.ts — **ทางเดียวของทั้งโมดูลที่เขียนคลัง**
 *
 * ⛔ ห้าม insert `just_me_stock_movements` แล้วไปบวก/ลบ `just_me_stock_balances` เองอีกต่อไป
 *    (ท่าเดิม 3 คำสั่งแยก → กดซ้ำได้ 2 รายการ · ยิงพร้อมกันแล้วยอดหาย · insert สำเร็จแต่ยอดพลาด)
 *    ทุกจุดต้องเรียก `postStockMovement()` ซึ่งเรียก RPC `just_me_post_movement` ครั้งเดียวแบบ atomic
 *
 * ⛔ `clientToken` = กุญแจกันกดซ้ำ — ส่งค่าเดิมซ้ำได้ movement เดิม (unique ต่อ org)
 *    หน้าเว็บต้องส่ง uuid มากับทุกการบันทึก · งาน batch ให้ผูก token ต่อบรรทัด (`<token>:<index>`)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type JustMeMovementType = "receive" | "transfer" | "issue" | "return";

export interface PostMovementArgs {
  orgId: string;
  itemId: string;
  type: JustMeMovementType;
  qty: number;
  sourceWarehouseId?: string | null;
  destinationWarehouseId?: string | null;
  referenceNo?: string | null;
  note?: string | null;
  /** ใส่ได้เฉพาะรายการรับเข้า — ประเภทอื่น trigger ตีมูลค่าด้วยต้นทุนเฉลี่ยให้เอง */
  unitCost?: number | null;
  projectId?: string | null;
  boqItemId?: string | null;
  purchaseRequestId?: string | null;
  requestedBy?: string | null;
  requesterName?: string | null;
  createdBy?: string | null;
  clientToken?: string | null;
  adjustmentReason?: string | null;
  stockCountId?: string | null;
}

export type PostMovementResult =
  | { ok: true; movementId: string }
  | { ok: false; error: string; status: number };

/** SQLSTATE ที่ RPC ใช้ส่ง "ข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง" ออกมา (invalid_parameter_value) */
const USER_FACING_SQLSTATE = "22023";

/**
 * แปลง error ของ RPC เป็น HTTP status + ข้อความไทย
 * — ห้ามโยน error ดิบของ postgres ให้ผู้ใช้เห็น (ผู้ใช้คือช่าง/เจ้าของกิจการ ไม่ใช่ DBA)
 */
export function translateMovementError(err: { code?: string | null; message?: string | null }): {
  error: string;
  status: number;
} {
  const code = err.code ?? "";
  const message = (err.message ?? "").trim();

  if (code === USER_FACING_SQLSTATE && message) return { error: message, status: 400 };
  if (code === "23505") {
    return { error: "รายการนี้ถูกบันทึกไปแล้ว กรุณาโหลดหน้าใหม่", status: 409 };
  }
  if (code === "42501") {
    return { error: message || "ไม่มีสิทธิ์บันทึกรายการคลังนี้", status: 403 };
  }
  if (code === "23503") {
    return { error: "มีข้อมูลที่อ้างถึงไม่อยู่ในองค์กรนี้", status: 400 };
  }
  return { error: "บันทึกรายการคลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", status: 500 };
}

/** เขียนคลัง 1 รายการ (movement + ยอดคงเหลือ) แบบ atomic */
export async function postStockMovement(
  db: SupabaseClient,
  args: PostMovementArgs,
): Promise<PostMovementResult> {
  const { data, error } = await db.rpc("just_me_post_movement", {
    p_org: args.orgId,
    p_item: args.itemId,
    p_type: args.type,
    p_qty: args.qty,
    p_src: args.sourceWarehouseId || null,
    p_dst: args.destinationWarehouseId || null,
    p_reference_no: args.referenceNo || null,
    p_note: args.note || null,
    p_unit_cost: args.unitCost === undefined ? null : args.unitCost,
    p_project: args.projectId || null,
    p_boq_item: args.boqItemId || null,
    p_purchase_request: args.purchaseRequestId || null,
    p_requested_by: args.requestedBy || null,
    p_requester_name: args.requesterName || null,
    p_created_by: args.createdBy || null,
    p_client_token: args.clientToken || null,
    p_adjustment_reason: args.adjustmentReason || null,
    p_stock_count: args.stockCountId || null,
  });

  if (error) return { ok: false, ...translateMovementError(error) };
  if (!data || typeof data !== "string") {
    return { ok: false, error: "บันทึกรายการคลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", status: 500 };
  }
  return { ok: true, movementId: data };
}

/** อ่าน movement ที่เพิ่งบันทึก (route เดิมคืนแถวเต็มให้ UI) */
export async function getMovement(
  db: SupabaseClient,
  orgId: string,
  movementId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from("just_me_stock_movements")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", movementId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** token ต่อบรรทัดของงาน batch — ผูกกับ token ก้อนเดียวที่หน้าเว็บส่งมา */
export function lineToken(token: string | null | undefined, key: string | number): string | null {
  const base = typeof token === "string" ? token.trim() : "";
  return base ? `${base}:${key}` : null;
}
