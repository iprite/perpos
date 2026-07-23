// payments/summary.ts — สูตรสรุปการเงินของหน้า /payments (ที่เดียว ห้ามคิดซ้ำใน component)
//
// หมายเหตุขอบเขต: KPI ที่ _fixtures/metrics.ts มีให้แล้ว (COD ค้างเก็บ) ต้องดึงจากที่นั่นเสมอ
// ที่นี่คิดเฉพาะยอดที่ผูกกับ "รายการชำระในหน่วยความจำของหน้านี้" ซึ่ง mutate ได้ระหว่างใช้งาน
// (metrics.ts คิดจาก fixture นิ่ง จึงใช้แทนกันไม่ได้)

import { money } from "../_fixtures/helpers";
import type { MattiiOrder, MattiiPayment } from "../_fixtures/types";

/** เงินที่ "เข้าจริง" ของรายการหนึ่ง — คืนเงินนับเป็นค่าลบ */
export function signedAmount(p: MattiiPayment): number {
  return p.payment_type === "refund" ? -p.amount : p.amount;
}

function isSameMonth(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export interface PaymentSummary {
  receivedThisMonth: number;
  depositReceived: number;
  outstandingTotal: number;
  pendingCount: number;
}

export function paymentSummary(payments: MattiiPayment[], orders: MattiiOrder[]): PaymentSummary {
  const paid = payments.filter((p) => p.status === "paid");
  return {
    receivedThisMonth: money(
      paid.filter((p) => isSameMonth(p.paid_at)).reduce((s, p) => s + signedAmount(p), 0),
    ),
    depositReceived: money(
      paid.filter((p) => p.payment_type === "deposit").reduce((s, p) => s + p.amount, 0),
    ),
    outstandingTotal: money(
      orders
        .filter((o) => o.status !== "cancelled")
        .reduce((s, o) => s + Math.max(o.outstanding_amount, 0), 0),
    ),
    pendingCount: payments.filter((p) => p.status === "pending").length,
  };
}

/** ออเดอร์ที่ยังค้างชำระ (มากไปน้อย) — ใช้ในแท็บ "ออเดอร์ค้างชำระ" */
export function outstandingOrders(orders: MattiiOrder[]): MattiiOrder[] {
  return orders
    .filter((o) => o.status !== "cancelled" && o.outstanding_amount > 0)
    .sort((a, b) => b.outstanding_amount - a.outstanding_amount);
}
