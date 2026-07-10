// money.ts — helper คำนวณ KPI/summary ฝั่ง client (rule ล้วน — spec §5b "rule คิด, AI เล่า")
// derive + base aggregate reuse จาก @/lib/gov-procure (single source กัน 2 แหล่งเลขไม่ตรง)
// เพิ่มเฉพาะ profitSplit / receivables / receivableSummary ที่ lib ไม่ export ในรูปนี้

import {
  computeAging,
  isOverdue,
  isRealized,
  pipelineValue,
  pipelineByStage,
  type StageSummary,
} from "@/lib/gov-procure/summary";
import type { GovProcureOrder } from "@/lib/gov-procure/types";
import { TODAY_DATE } from "./format";

// re-export ของ lib ให้หน้าเดิม import จาก barrel ได้เหมือนเดิม
export { isRealized, pipelineValue, pipelineByStage };
export type { StageSummary };

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
      agingDays: computeAging(o, today) ?? 0,
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
