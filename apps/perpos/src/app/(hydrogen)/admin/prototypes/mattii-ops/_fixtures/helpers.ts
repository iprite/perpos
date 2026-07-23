// helpers.ts — ค่าคงที่ + ตัวช่วยคำนวณวันที่สัมพันธ์กับ "วันนี้"
// กันวันที่ตายที่จะเก่าเมื่อเวลาผ่านไป (prototype ต้องดูสดเสมอ)
import type { OrderStage, OrderStatus } from "./types";

export const MOCK_ORG_ID = "org-mattii-demo";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp ย้อนหลัง n วัน (n ติดลบ = อนาคต) จากเวลาปัจจุบัน ชั่วโมง/นาทีกำหนดได้ */
export function daysAgo(n: number, hour = 9, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setTime(d.getTime() - n * DAY_MS);
  return d.toISOString();
}

/** ISO timestamp ล่วงหน้า n วันจากเวลาปัจจุบัน */
export function daysFromNow(n: number, hour = 9, minute = 0): string {
  return daysAgo(-n, hour, minute);
}

/** วันที่ล้วน (YYYY-MM-DD) ย้อนหลัง n วัน */
export function dateOnlyAgo(n: number): string {
  return daysAgo(n).slice(0, 10);
}

/** วันที่ล้วน (YYYY-MM-DD) ล่วงหน้า n วัน */
export function dateOnlyFromNow(n: number): string {
  return daysFromNow(n).slice(0, 10);
}

/** ปัดเงินเป็นทศนิยม 2 ตำแหน่ง (กันเศษ floating point) */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ปริมาณผ้าโดยประมาณต่อผืน (ตร.ม.) จาก กว้าง×ยาว(ซม.) + เผื่อขอบ 15% */
export function fabricUsage(widthCm: number, lengthCm: number): number {
  return Math.round(((widthCm * lengthCm) / 10000) * 1.15 * 1000) / 1000;
}

/** รวมยอดจากรายการ (line_total) เป็น subtotal */
export function sumLineTotals(items: { line_total: number }[]): number {
  return money(items.reduce((s, it) => s + it.line_total, 0));
}

// ---- order_stage — Contract v3: 5 ช่วงรวบ 14 order_status (derived, ไม่เก็บเป็นข้อมูล) ----
// บอร์ด/KPI/filter default ใช้ 5 ช่วงนี้เป็นหลัก — label ไทยอยู่ที่ labels.ts (แหล่งเดียว)

/** map สถานะดิบ (14 ค่า) → ช่วงรวบ (5 ค่า) — ห้ามมีสถานะไหนตกหล่น */
export const ORDER_STAGE_OF: Record<OrderStatus, OrderStage> = {
  draft: "receive",
  quoted: "receive",
  confirmed: "receive",
  designing: "design",
  awaiting_cf: "design",
  cf_approved: "design",
  printing: "produce",
  qc: "produce",
  packing: "produce",
  ready_to_ship: "ship",
  shipped: "ship",
  delivered: "ship",
  on_hold: "paused",
  cancelled: "paused",
};

/** หา order_stage จากสถานะดิบ */
export function orderStage(status: OrderStatus): OrderStage {
  return ORDER_STAGE_OF[status];
}

/** ลำดับ 5 ช่วงมาตรฐาน (ใช้กำหนด column order ของบอร์ด/รายงาน) */
export const ORDER_STAGE_LIST: OrderStage[] = ["receive", "design", "produce", "ship", "paused"];
