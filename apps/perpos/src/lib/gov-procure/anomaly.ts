// lib/gov-procure/anomaly.ts — Anomaly / Margin Guard (pure, rule-based — §5b AI-2)
// สถาปัตยกรรม "rule คิด, AI เล่า": rule ตรวจ margin ผิดปกติฟรี (ไม่เรียก AI) → คืน signal
// (severity + checks เชิงกฎ + metrics ตัวเลขล้วน). AI narrate ผ่าน route /ai/anomaly เท่านั้น.
//
// เกณฑ์ (spec §5b AI-2):
//   R1 low_margin      : profit_pct < median(profit_pct)×0.5  หรือ  profit_pct < 3
//   R2 cost_too_high   : total_cost_89 / price_incl_vat > 0.9
//   R3 internal_exceed : customer_change + petty_cash + operate_89 + commission_amount > gross_profit
//   R4 negative_profit : net_profit_89 < 0  (รวม cost_ratio > 1 = ขาดทุนจริง)

import type { GovProcureOrder } from "./types";

export type AnomalySeverity = "none" | "low" | "medium" | "high";

/** signal ตัวเลขล้วน (ไม่ส่ง raw order เข้า AI — กัน prompt-injection + input เล็ก) */
export interface GovProcureAnomalySignal {
  order_id: string;
  seq_no: number | null;
  severity: AnomalySeverity;
  /** เหตุผลเชิงกฎภาษาไทย (มีตัวเลขจาก field จริง) — rule เขียน, AI แค่เล่าต่อ */
  checks: string[];
  /** metrics ที่ใช้ตัดสิน (ตัวเลขจาก order — AI อ้างอิงได้ ห้ามคิดใหม่) */
  metrics: {
    price_incl_vat: number | null;
    total_cost_89: number | null;
    net_profit_89: number | null;
    gross_profit: number | null;
    profit_pct: number | null;
    cost_ratio: number | null; // total_cost_89 / price_incl_vat
    internal_cost: number | null; // ทอน+petty+operate+commission
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** มัธยฐานของ profit_pct จากงานที่มีค่า (ใช้เป็นฐาน relative-margin R1) — null ถ้าไม่มีข้อมูลพอ */
export function medianProfitPct(orders: GovProcureOrder[]): number | null {
  const vals = orders
    .map((o) => o.profit_pct)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
}

/**
 * detectAnomaly — ตรวจงานเดียว เทียบกับ median ของทั้งพอร์ต (สำหรับ R1 relative).
 * คืน signal เสมอ: severity='none' + checks ว่าง ถ้าไม่ผิดปกติ.
 * order ที่ยังไม่มีข้อมูลการเงิน (price/cost null) → 'none' (ยังตรวจไม่ได้).
 */
export function detectAnomaly(
  order: GovProcureOrder,
  allOrders: GovProcureOrder[] = [order],
): GovProcureAnomalySignal {
  const price = order.price_incl_vat;
  const cost89 = order.total_cost_89;
  const netProfit = order.net_profit_89;
  const gross = order.gross_profit;
  const profitPct = order.profit_pct;

  const costRatio = price != null && price > 0 && cost89 != null ? round2(cost89 / price) : null;

  const internalCost =
    order.customer_change != null ||
    order.petty_cash != null ||
    order.operate_89 != null ||
    order.commission_amount != null
      ? round2(
          (order.customer_change ?? 0) +
            (order.petty_cash ?? 0) +
            (order.operate_89 ?? 0) +
            (order.commission_amount ?? 0),
        )
      : null;

  const metrics: GovProcureAnomalySignal["metrics"] = {
    price_incl_vat: price ?? null,
    total_cost_89: cost89 ?? null,
    net_profit_89: netProfit ?? null,
    gross_profit: gross ?? null,
    profit_pct: profitPct ?? null,
    cost_ratio: costRatio,
    internal_cost: internalCost,
  };

  // ยังไม่มีข้อมูลการเงินขั้นต่ำ → ตรวจไม่ได้
  if (price == null || cost89 == null) {
    return { order_id: order.id, seq_no: order.seq_no, severity: "none", checks: [], metrics };
  }

  const median = medianProfitPct(allOrders);
  const checks: string[] = [];

  // ── R4 negative_profit (รวม cost_ratio > 1) → high ──
  const isNegative = netProfit != null && netProfit < 0;
  const isZero = netProfit != null && netProfit === 0;
  const costOverPrice = costRatio != null && costRatio > 1;
  if (isNegative || costOverPrice) {
    if (costOverPrice && costRatio != null) {
      checks.push(
        `ทุนรวม 89 (${fmt(cost89)} ฿) สูงกว่าราคาขาย (${fmt(price)} ฿) — cost_ratio = ${Math.round(costRatio * 100)}% (ขาดทุนจริง)`,
      );
    }
    if (isNegative && netProfit != null) {
      checks.push(
        `กำไรสุทธิ 89 ติดลบ (${fmt(netProfit)} ฿) — งานนี้ขาดทุน ควรตรวจการคีย์ทุน/ทอน/petty/operate`,
      );
    }
  } else if (isZero) {
    checks.push(`กำไรสุทธิ 89 = 0.00 ฿ พอดี — ไม่เหลือกำไรเลย ควรตรวจการคำนวณต้นทุน`);
  }

  // ── R2 cost_too_high (>0.9 แต่ยังไม่เกิน 1 = แยกจาก R4) ──
  if (costRatio != null && costRatio > 0.9 && costRatio <= 1) {
    checks.push(
      `ต้นทุนกินสัดส่วนสูง — ทุนรวม 89 (${fmt(cost89)} ฿) = ${Math.round(costRatio * 100)}% ของราคาขาย (เกิน threshold 90%)`,
    );
  }

  // ── R3 internal_exceed (ทอน+petty+operate+commission > gross_profit) ──
  if (internalCost != null && gross != null && internalCost > gross) {
    checks.push(
      `ค่าใช้จ่ายภายใน (ทอน+petty+ดำเนินการ+คอม = ${fmt(internalCost)} ฿) มากกว่ากำไรขั้นต้น (${fmt(gross)} ฿) — กัดกำไรจนแทบไม่เหลือ`,
    );
  }

  // ── R1 low_margin (absolute <3% หรือ relative < median×0.5) ──
  if (profitPct != null) {
    const belowAbsolute = profitPct < 3;
    const belowRelative = median != null && median > 0 && profitPct < median * 0.5;
    if (belowAbsolute || belowRelative) {
      const parts: string[] = [`profit_pct = ${profitPct.toFixed(2)}%`];
      if (belowAbsolute) parts.push("ต่ำกว่า 3%");
      if (belowRelative && median != null)
        parts.push(`ต่ำกว่าครึ่งหนึ่งของค่ากลางพอร์ต (median ${median.toFixed(2)}%)`);
      checks.push(`กำไรบางผิดปกติ — ${parts.join(" · ")}`);
    }
  }

  if (checks.length === 0) {
    return { order_id: order.id, seq_no: order.seq_no, severity: "none", checks: [], metrics };
  }

  // severity: negative/ขาดทุนจริง/0 → high · cost>0.9 หรือ internal-exceed → medium · low-margin เดี่ยว → low
  let severity: AnomalySeverity;
  if (isNegative || costOverPrice || isZero) severity = "high";
  else if (
    (costRatio != null && costRatio > 0.9) ||
    (internalCost != null && gross != null && internalCost > gross)
  )
    severity = "medium";
  else severity = "low";

  return { order_id: order.id, seq_no: order.seq_no, severity, checks, metrics };
}

/**
 * detectAnomalies — ตรวจทั้งพอร์ต คืนเฉพาะงานที่ผิดปกติ (severity ≠ none),
 * เรียง high → medium → low. ใช้ median ของ orders ทั้งชุดเป็นฐาน relative-margin.
 */
export function detectAnomalies(orders: GovProcureOrder[]): GovProcureAnomalySignal[] {
  const rank: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2, none: 3 };
  return orders
    .map((o) => detectAnomaly(o, orders))
    .filter((s) => s.severity !== "none")
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}
