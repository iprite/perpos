// lib/gov-procure/summary.ts — KPI/aggregate compute (pure, rule-based — §5b "rule คิด, AI เล่า")
// mirror prototype _components/money.ts + _fixtures/types.ts (deriveAging/isOverdue) ให้ตรงเป๊ะ
// reuse: route /api/gov-procure/summary + SSR dashboard page

import type { Company, GovProcureOrder, Stage } from "./types";
import { STAGE_ORDER } from "./stage";

// ---- derived (pure — §3.3) ----

/** duration_days = receipt_date − contract_date (วัน) — null ถ้าวันใดไม่ set */
export function computeDuration(order: GovProcureOrder): number | null {
  if (!order.contract_date || !order.receipt_date) return null;
  const start = new Date(order.contract_date).getTime();
  const end = new Date(order.receipt_date).getTime();
  const days = Math.round((end - start) / 86_400_000);
  return days >= 0 ? days : null;
}

/** aging_days = today − delivery_date เมื่อ stage=delivered (ยังไม่ paid) — null ถ้าไม่เข้าเงื่อนไข */
export function computeAging(order: GovProcureOrder, today: Date = new Date()): number | null {
  if (order.stage !== "delivered" || !order.delivery_date) return null;
  const start = new Date(order.delivery_date).getTime();
  const days = Math.round((today.getTime() - start) / 86_400_000);
  return days >= 0 ? days : null;
}

/** is_overdue = aging_days > sla_threshold */
export function isOverdue(
  order: GovProcureOrder,
  slaThreshold: number,
  today: Date = new Date(),
): boolean {
  const aging = computeAging(order, today);
  return aging !== null && aging > slaThreshold;
}

/** งานที่ "รับรู้แล้ว" = stage paid/closed */
export function isRealized(o: GovProcureOrder): boolean {
  return o.stage === "paid" || o.stage === "closed";
}

// ---- aggregate ----

export interface StageSummary {
  stage: Stage;
  count: number;
  value: number;
}

export interface ReceivableRow {
  order_id: string;
  seq_no: number | null;
  customer_name: string;
  department: string | null;
  company: Company | null;
  product_description: string | null;
  aging_days: number;
  overdue: boolean;
  amount: number;
}

export interface CompanySplit {
  company: Company;
  count: number;
  pipeline_value: number;
  realized_profit: number;
  pending_profit: number;
}

export interface GovProcureSummary {
  order_count: number;
  pipeline_value: number; // Σ price_incl_vat
  profit_realized: number; // Σ net_profit_89 (paid|closed)
  profit_pending: number; // Σ net_profit_89 (ที่เหลือ)
  by_stage: StageSummary[]; // 6 stage เสมอ (เรียงตาม STAGE_ORDER)
  receivable_total: number; // Σ net_receivable ของงาน delivered
  receivable_count: number;
  overdue_count: number;
  overdue_amount: number;
  receivables: ReceivableRow[]; // เรียง aging มาก→น้อย
  by_company: CompanySplit[]; // split 89 / P2P
  sla_threshold: number;
}

const COMPANIES: Company[] = ["89 Global Work", "P2P Supply"];

/** มูลค่าพอร์ตรวม = Σ price_incl_vat (null → 0) */
export function pipelineValue(orders: GovProcureOrder[]): number {
  return orders.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0);
}

/** สรุป pipeline ต่อ stage — คืน 6 stage เสมอ (แม้ 0 งาน) */
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

/**
 * computeSummary — KPI dashboard aggregate ครบ (pipeline / profit realized-pending /
 * เงินค้างรับ+overdue / split 89-P2P). server เรียกใน route summary + reuse SSR.
 */
export function computeSummary(
  orders: GovProcureOrder[],
  slaThreshold: number,
  today: Date = new Date(),
): GovProcureSummary {
  let realized = 0;
  let pending = 0;
  for (const o of orders) {
    const p = o.net_profit_89 ?? 0;
    if (isRealized(o)) realized += p;
    else pending += p;
  }

  const receivables: ReceivableRow[] = orders
    .filter((o) => o.stage === "delivered")
    .map((o) => ({
      order_id: o.id,
      seq_no: o.seq_no,
      customer_name: o.customer_name,
      department: o.department,
      company: o.company,
      product_description: o.product_description,
      aging_days: computeAging(o, today) ?? 0,
      overdue: isOverdue(o, slaThreshold, today),
      amount: o.net_receivable ?? 0,
    }))
    .sort((a, b) => b.aging_days - a.aging_days);

  const overdue = receivables.filter((r) => r.overdue);

  const by_company: CompanySplit[] = COMPANIES.map((company) => {
    const rows = orders.filter((o) => o.company === company);
    let rProfit = 0;
    let pProfit = 0;
    for (const o of rows) {
      const p = o.net_profit_89 ?? 0;
      if (isRealized(o)) rProfit += p;
      else pProfit += p;
    }
    return {
      company,
      count: rows.length,
      pipeline_value: rows.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0),
      realized_profit: rProfit,
      pending_profit: pProfit,
    };
  });

  return {
    order_count: orders.length,
    pipeline_value: pipelineValue(orders),
    profit_realized: realized,
    profit_pending: pending,
    by_stage: pipelineByStage(orders),
    receivable_total: receivables.reduce((s, r) => s + r.amount, 0),
    receivable_count: receivables.length,
    overdue_count: overdue.length,
    overdue_amount: overdue.reduce((s, r) => s + r.amount, 0),
    receivables,
    by_company,
    sla_threshold: slaThreshold,
  };
}
