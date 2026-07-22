// lib/gov-procure/stage.ts — state machine helpers (pure, reuse SSR + API)
// ยึด specs/gov_procure.md §4 + §4.1 (Hybrid derive — closed = manual-only)

import { STAGES, type GovProcureOrder, type Stage } from "./types";

export const STAGE_ORDER: Stage[] = STAGES;

export const STAGE_LABELS: Record<Stage, string> = {
  quotation: "เสนอราคา",
  contracted: "เซ็นสัญญาแล้ว รอส่งของ",
  procuring: "สั่งซื้อ/ชำระซัพพลายเออร์",
  delivered: "ส่งสินค้าแล้ว รอรับเช็ค",
  paid: "รับเช็คแล้ว",
  closed: "ปิดงาน",
};

/** tone มาตรฐานต่อ stage (ก่อนพิจารณา overdue) — ใช้กับ <StatusBadge tone=…> */
export const STAGE_TONE: Record<Stage, "neutral" | "info" | "warning" | "success"> = {
  quotation: "neutral",
  contracted: "warning", // ส้ม/เหลือง = เซ็นแล้วแต่ยังไม่ส่งของ (ยังไม่คืบ)
  procuring: "warning",
  delivered: "info", // น้ำเงิน = ส่งของแล้ว รอรับเช็ค
  paid: "success", // เขียว = รับเช็คแล้ว
  closed: "success",
};

/**
 * milestone date field ที่ผูกกับแต่ละ stage (§4 / §3.1 กลุ่ม F).
 * quotation/closed = null (quotation ยังไม่มีหมุด · closed = manual close ไม่ผูกหมุด §4).
 */
export const STAGE_MILESTONE_FIELD: Record<Stage, keyof GovProcureOrder | null> = {
  quotation: null,
  contracted: "contract_date",
  procuring: "payment_order_date",
  delivered: "delivery_date",
  paid: "receipt_date",
  closed: null,
};

export function isValidStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as string[]).includes(value);
}

/**
 * deriveStage — hybrid suggest จาก milestone dates (§4.1).
 * มองหาหมุดล่าสุดที่ set: receipt → paid, delivery → delivered, payment_order → procuring,
 * contract → contracted, ไม่มี → quotation.
 * **closed ไม่ derive** (manual-only; commission_payment_date ไม่นับ) — ใช้ตอน validate/suggest เท่านั้น
 * ไม่ทับ stage จริงถ้าผู้ใช้ manual override.
 */
export function deriveStage(order: GovProcureOrder): Stage {
  if (order.receipt_date) return "paid";
  if (order.delivery_date) return "delivered";
  if (order.payment_order_date) return "procuring";
  if (order.contract_date) return "contracted";
  return "quotation";
}
