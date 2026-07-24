/**
 * lib/bi/format.ts — จัดรูปแบบตัวเลขของคำตอบ BI ตาม DESIGN.md §3/§14
 *
 * กฎที่ผิดแล้วเสียหาย:
 *  - **ยอดลบใช้ U+2212 (`−`) ไม่ใช่ hyphen (`-`)** — ทั้งบนเว็บ, ใน bullet ที่ LLM เรียบเรียง และบน LINE
 *  - เงินไทย = `1,234.56 ฿` (คั่นหลักพัน, ทศนิยม 2, สัญลักษณ์ท้าย) · ฝั่ง UI ต้อง tabular-nums
 *  - หน่วยอื่น: `count` = จำนวนเต็ม · `days` = "N วัน" · `percent` = "N.N%"
 */

import type { MetricUnit } from "./types";

/** U+2212 MINUS SIGN — ห้ามใช้ hyphen กับยอดลบ (DESIGN §2) */
export const MINUS = "−";

function defaultDecimals(unit: MetricUnit): number {
  switch (unit) {
    case "thb":
      return 2;
    case "percent":
      return 1;
    default:
      return 0;
  }
}

function groupDigits(abs: number, decimals: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
}

export interface FormatMetricValueOpts {
  /** ทศนิยม (default ตามหน่วย: thb=2, percent=1, อื่น ๆ=0) */
  decimals?: number;
  /** false = ไม่ต่อท้ายด้วยหน่วย (฿ / วัน / %) */
  withUnit?: boolean;
}

/** จัดรูปแบบค่าของ metric ตามหน่วย — ค่าที่อ่านไม่ได้ (null/NaN) คืน "—" */
export function formatMetricValue(
  value: number | null | undefined,
  unit: MetricUnit,
  opts: FormatMetricValueOpts = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";

  const n = Number(value);
  const decimals =
    Number.isFinite(opts.decimals) && (opts.decimals as number) >= 0
      ? Math.trunc(opts.decimals as number)
      : defaultDecimals(unit);
  const withUnit = opts.withUnit !== false;

  const body = groupDigits(Math.abs(n), decimals);
  // ปัดแล้วอาจกลายเป็น 0 → ไม่ต้องติดลบ (เลี่ยง "−0.00")
  const isNegative = n < 0 && Number(body.replace(/,/g, "")) !== 0;
  const sign = isNegative ? MINUS : "";

  switch (unit) {
    case "thb":
      return withUnit ? `${sign}${body} ฿` : `${sign}${body}`;
    case "days":
      return withUnit ? `${sign}${body} วัน` : `${sign}${body}`;
    case "percent":
      return withUnit ? `${sign}${body}%` : `${sign}${body}`;
    case "count":
    default:
      return `${sign}${body}`;
  }
}

/**
 * เปอร์เซ็นต์การเปลี่ยนแปลงเทียบช่วงก่อน (สำหรับ delta บน StatCard)
 * คืน `null` เมื่อฐานเป็น 0/ไม่มีค่า — **ห้ามแสดง "เพิ่มขึ้น ∞%"**
 */
export function formatDeltaPercent(current: number, previous: number): string | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct < 0 ? MINUS : "+";
  return `${sign}${groupDigits(Math.abs(pct), 1)}%`;
}
