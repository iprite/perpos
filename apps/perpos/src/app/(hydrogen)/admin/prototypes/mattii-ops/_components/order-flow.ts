// order-flow.ts — state machine ของออเดอร์ (Contract v3 §3.0.1 + §3.7) — แหล่งเดียว
//
// binding:
//  - "ขั้นถัดไป" มีได้ปุ่มเดียวต่อสถานะ (primary) — ห้าม dropdown เลือกสถานะ
//  - action นอกเส้น (พักงาน/ยกเลิก/ย้อนกลับไปแก้ลาย/QC ไม่ผ่าน) = action รอง
//  - ห้าม hard block เรื่องมัดจำ/การชำระเงินที่ transition ใด ๆ (v2 decision)

import type { MattiiRole } from "./role-context";
import type { OrderStatus } from "../_fixtures/types";

export interface NextAction {
  to: OrderStatus;
  /** ป้ายปุ่ม (คำไทย canonical ตาม §3.0.1) */
  label: string;
  /** role ที่กดได้ */
  roles: MattiiRole[];
}

/** ปุ่ม "ขั้นถัดไป" ต่อสถานะ (null = จบงาน/ไม่มีขั้นถัดไปบนเส้นหลัก) */
export const NEXT_ACTION: Record<OrderStatus, NextAction | null> = {
  draft: { to: "quoted", label: "เสนอราคา", roles: ["sale", "owner"] },
  quoted: { to: "confirmed", label: "ยืนยันออเดอร์", roles: ["sale", "owner"] },
  confirmed: { to: "designing", label: "เริ่มทำลาย", roles: ["sale", "owner", "designer"] },
  designing: { to: "awaiting_cf", label: "ส่งให้ลูกค้ายืนยันลาย", roles: ["designer", "owner"] },
  awaiting_cf: { to: "cf_approved", label: "บันทึกผลยืนยันจากลูกค้า", roles: ["sale", "owner"] },
  cf_approved: { to: "printing", label: "เข้าคิวพิมพ์", roles: ["production", "owner"] },
  printing: { to: "qc", label: "พิมพ์เสร็จ", roles: ["production", "owner"] },
  qc: { to: "packing", label: "QC ผ่าน", roles: ["production", "owner"] },
  packing: { to: "ready_to_ship", label: "แพ็คเสร็จ", roles: ["production", "owner"] },
  ready_to_ship: { to: "shipped", label: "ส่งของ (ออกเลขพัสดุ)", roles: ["production", "owner"] },
  shipped: { to: "delivered", label: "ยืนยันลูกค้าได้รับ", roles: ["production", "sale", "owner"] },
  delivered: null,
  cancelled: null,
  on_hold: null, // ปลดพักงาน = คืนสู่ previous_status (จัดการแยกใน data-context)
};

/** สถานะที่ถือว่า "ปิดงานแล้ว" — พักงาน/ยกเลิกไม่ได้ */
export const CLOSED_STATUSES: OrderStatus[] = ["shipped", "delivered", "cancelled"];

/** role นี้กดปุ่มขั้นถัดไปของสถานะนี้ได้ไหม */
export function canAdvance(status: OrderStatus, role: MattiiRole): boolean {
  const next = NEXT_ACTION[status];
  return !!next && next.roles.includes(role);
}

/** พักงาน/ยกเลิกได้เมื่อยังไม่ shipped ขึ้นไป และผู้กดเป็น sale/owner */
export function canHoldOrCancel(status: OrderStatus, role: MattiiRole): boolean {
  if (CLOSED_STATUSES.includes(status) || status === "on_hold") return false;
  return role === "sale" || role === "owner";
}

/** ปลดพักงาน (on_hold → previous_status) */
export function canUnhold(status: OrderStatus, role: MattiiRole): boolean {
  return status === "on_hold" && (role === "sale" || role === "owner");
}

/** ย้อนกลับไปแก้ลาย: awaiting_cf → designing (ลูกค้าขอแก้) */
export function canSendBackToDesign(status: OrderStatus, role: MattiiRole): boolean {
  return status === "awaiting_cf" && (role === "sale" || role === "owner" || role === "designer");
}

/** QC ไม่ผ่าน: qc → printing (พิมพ์ซ้ำ) */
export function canFailQc(status: OrderStatus, role: MattiiRole): boolean {
  return status === "qc" && (role === "production" || role === "owner");
}
