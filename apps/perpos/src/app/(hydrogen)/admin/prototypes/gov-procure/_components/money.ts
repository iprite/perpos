// money.ts — helper คำนวณ KPI/summary จาก orders (rule ล้วน — ไม่ใช่ AI · spec §5b "rule คิด, AI เล่า")
// ทุกฟังก์ชัน pure — รับ orders + sla แล้วคืนตัวเลข ใช้ที่ dashboard/receivables/reports

import {
  STAGE_ORDER,
  deriveAgingDays,
  isOverdue,
  type GovProcureOrder,
  type Stage,
} from "../_fixtures/types";
import { TODAY_DATE } from "./format";

/** มูลค่าพอร์ตรวม = Σ price_incl_vat (นับ null เป็น 0) */
export function pipelineValue(orders: GovProcureOrder[]): number {
  return orders.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0);
}

/** งานที่ "รับรู้แล้ว" = stage paid/closed · pending = ที่เหลือ (ยังไม่ปิด) */
export function isRealized(o: GovProcureOrder): boolean {
  return o.stage === "paid" || o.stage === "closed";
}

/** กำไรสุทธิ 89 รวม (แยก realized/pending) */
export function profitSplit(orders: GovProcureOrder[]): {
  realized: number;
  pending: number;
  total: number;
} {
  let realized = 0;
  let pending = 0;
  for (const o of orders) {
    const p = o.net_profit_89 ?? 0;
    if (isRealized(o)) realized += p;
    else pending += p;
  }
  return { realized, pending, total: realized + pending };
}

/** เงินค้างรับ = งาน stage=delivered (ส่งของแล้ว ยังไม่รับเช็ค) — ใช้ net_receivable */
export interface Receivable {
  order: GovProcureOrder;
  agingDays: number;
  overdue: boolean;
  amount: number;
}

export function receivables(
  orders: GovProcureOrder[],
  slaThreshold: number,
  today: Date = TODAY_DATE,
): Receivable[] {
  return orders
    .filter((o) => o.stage === "delivered")
    .map((o) => ({
      order: o,
      agingDays: deriveAgingDays(o, today) ?? 0,
      overdue: isOverdue(o, slaThreshold, today),
      amount: o.net_receivable ?? 0,
    }))
    .sort((a, b) => b.agingDays - a.agingDays);
}

/** สรุปเงินค้างรับ (ยอดรวม / overdue) */
export function receivableSummary(
  orders: GovProcureOrder[],
  slaThreshold: number,
  today: Date = TODAY_DATE,
): {
  list: Receivable[];
  totalAmount: number;
  overdueCount: number;
  overdueAmount: number;
} {
  const list = receivables(orders, slaThreshold, today);
  const totalAmount = list.reduce((s, r) => s + r.amount, 0);
  const overdue = list.filter((r) => r.overdue);
  return {
    list,
    totalAmount,
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, r) => s + r.amount, 0),
  };
}

/** สรุป pipeline ต่อ stage (จำนวน + มูลค่า ฿) — เรียงตาม STAGE_ORDER */
export interface StageSummary {
  stage: Stage;
  count: number;
  value: number;
}

export function pipelineByStage(orders: GovProcureOrder[]): StageSummary[] {
  return STAGE_ORDER.map((stage) => {
    const inStage = orders.filter((o) => o.stage === stage);
    return {
      stage,
      count: inStage.length,
      value: inStage.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0),
    };
  });
}
