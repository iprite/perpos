/**
 * metric-direction.ts — "เพิ่มขึ้นแปลว่าดีหรือแย่" ของแต่ละตัวชี้วัด (UI เท่านั้น)
 *
 * ทำไมต้องมี: แถบเทียบช่วงบนการ์ดเคยทาสี `delta > 0 → เขียว` เสมอ ⇒ ต้นทุนซื้อเพิ่ม /
 * เงินคืนผู้ลงทุนเพิ่ม กลายเป็นสีเขียว = ผู้บริหารอ่านกลับด้าน (อันตรายกว่าไม่ใส่สีเลย)
 * DESIGN.md §2: เขียว = positive/กำไร, แดง = negative เท่านั้น
 *
 * กฎ: **ไม่มีคีย์ในแมปนี้ = กลาง** (ไม่ทาสี ใช้ลูกศรบอกทิศทางอย่างเดียว)
 * ใส่คีย์เพิ่มได้เฉพาะตัวชี้วัดที่ "ทิศทางดี/ไม่ดี" ชัดเจนโดยไม่ต้องดูบริบท
 * — ตัวที่กำกวม (ลูกหนี้คงค้าง, เงินกองทุน, จำนวนใบงาน) ให้ปล่อยเป็นกลาง
 */

export type MetricDirection = "higher_better" | "lower_better";

export const METRIC_DIRECTION: Record<string, MetricDirection> = {
  // เพิ่มขึ้น = ดี
  "gov_procure.pipeline_value_incl_vat": "higher_better",
  "gov_procure.pipeline_value_excl_vat": "higher_better",
  "gov_procure.by_company_incl_vat": "higher_better",
  "gov_procure.by_company_excl_vat": "higher_better",
  "gov_procure.revenue_collected": "higher_better",
  "gov_procure.profit_realized": "higher_better",
  "gov_procure.profit_pending": "higher_better",
  "gov_procure.profit_margin_pct_incl_vat": "higher_better",
  "gov_procure.profit_margin_pct_excl_vat": "higher_better",

  // เพิ่มขึ้น = ไม่ดี
  "gov_procure.purchase_cost_total": "lower_better",
  "gov_procure.cost_total": "lower_better",
  "gov_procure.receivable_overdue": "lower_better",
  "gov_procure.cycle_time_avg": "lower_better",
  "gov_procure.stuck_orders": "lower_better",
};

/** ทิศทางของตัวชี้วัด — `null` = กลาง (ห้ามทาสีเขียว/แดง) */
export function metricDirectionOf(metricKey: string | null | undefined): MetricDirection | null {
  if (!metricKey) return null;
  return METRIC_DIRECTION[metricKey] ?? null;
}
