// money.ts — คำนวณยอดค้างชำระต่อ booking (contract §5 LOCKED)
//
// 🔒 refund sign convention (LOCKED): payments.amount เก็บค่าบวกเสมอ (≥ 0) ทุก kind รวม refund.
//   deposit/balance/extra = เงินเข้า · refund = เงินออก (คืนแขก → บวกกลับเข้ายอดค้าง)
//
// ยอดค้าง = grand_total − Σamount(kind != refund) + Σamount(kind = refund)

import type { Booking, Payment } from "../_fixtures/types";

/** ยอดที่ชำระเข้ามาแล้วจริง (สุทธิ = เงินเข้า − refund) */
export function computePaidNet(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount : p.amount), 0);
}

/** เงินเข้ารวม (ไม่นับ refund) — สำหรับแสดง "จ่ายแล้ว" */
export function computePaidIn(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + (p.kind === "refund" ? 0 : p.amount), 0);
}

/** เงินคืนรวม (refund) */
export function computeRefund(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + (p.kind === "refund" ? p.amount : 0), 0);
}

/**
 * ยอดค้างชำระของ booking — ใช้สูตร LOCKED §5
 * balance = grand_total − Σ(non-refund) + Σ(refund)
 */
export function computeBalance(booking: Booking, paymentsForBooking: Payment[]): number {
  return booking.grand_total - computePaidNet(paymentsForBooking);
}

/** ดึง payments ของ booking หนึ่ง (helper) */
export function paymentsOf(bookingId: string, all: Payment[]): Payment[] {
  return all.filter((p) => p.booking_id === bookingId);
}
