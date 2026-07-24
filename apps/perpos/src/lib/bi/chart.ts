/**
 * lib/bi/chart.ts — เลือกชนิดกราฟ **แบบ deterministic จากรูปทรงผลลัพธ์** (contract §3.3)
 *
 * ทำไมต้อง deterministic: ผู้บริหารเห็นกราฟผิดชนิดครั้งเดียวก็ตีความผิด — การเลือกกราฟ
 * จึงเป็นกฎ ไม่ใช่ให้ LLM เดา · LLM ทำแค่เรียบเรียงคำพูด (`answer.ts`)
 *
 * ตาราง §3.3 (เรียงตามลำดับการตัดสิน):
 *   แถวรายการ (grain = transaction) → table
 *   ตัวเลขเดียว                     → stat
 *   สองมิติ × เวลา                  → stacked_bar
 *   อนุกรมเวลา                      → line (หลายชุด = multi-line)
 *   ขั้นตอน/สถานะเป็นลำดับ           → funnel
 *   มิติเดียวแต่หลาย measure         → table
 *   สัดส่วนของทั้งหมด ≤ 5 กลุ่ม      → donut
 *   หมวดหมู่ ≤ 8 กลุ่ม               → bar
 *   หมวดหมู่ > 8 กลุ่ม               → bar top-N + "อื่น ๆ"
 *
 * `chart_hint` ของ metric override ผลข้างบนได้ (ยกเว้นชนิดที่ไม่ถูกต้องเชิงข้อมูล — ดู `chooseChart`)
 */

import {
  isChartType,
  type BiChartSeries,
  type BiChartSpec,
  type ChartType,
  type MetricUnit,
} from "./types";

/** จำนวนกลุ่มสูงสุดก่อนยุบเป็น "อื่น ๆ" (§3.3) */
export const CATEGORY_LIMIT = 8;
/** จำนวนกลุ่มสูงสุดที่ donut ยังอ่านออก (§3.3) */
export const DONUT_LIMIT = 5;
export const OTHER_LABEL = "อื่น ๆ";

/** รูปทรงของ result set ที่ใช้ตัดสินชนิดกราฟ */
export interface BiResultShape {
  /** จำนวนแถวของผลลัพธ์ (หลัง aggregate) */
  rowCount: number;
  /** จำนวนคอลัมน์ measure (ตัวเลข) */
  measureCount: number;
  /** จำนวนมิติที่ group by (รวมแกนเวลา) */
  dimensionCount: number;
  /** true = มีมิติหนึ่งเป็นแกนเวลา */
  hasTimeDimension: boolean;
  /** true = grain ของ metric เป็นรายการ/transaction (drill-down) */
  isDetailGrain?: boolean;
  /** true = ตัวเลขชุดนี้เป็นสัดส่วนของทั้งหมด (part-to-whole) */
  isPartToWhole?: boolean;
  /** true = มิติเป็นขั้นตอน/สถานะที่มีลำดับ (pipeline 6 stage) */
  isSequentialStage?: boolean;
}

export interface BiChartChoice {
  type: ChartType;
  /** มีค่าเมื่อ bar ต้องยุบกลุ่มส่วนเกินเป็น "อื่น ๆ" */
  top_n?: number;
  other_label?: string;
  stacked?: boolean;
  /** ที่มาของการตัดสิน — `hint` = `chart_hint` ของ metric override */
  source: "shape" | "hint";
  /** เหตุผลสั้น ๆ (ใช้ใน panel "ดูวิธีคำนวณ" / debug) */
  reason: string;
}

/** ชนิดกราฟที่ห้าม hint override เพราะขัดกับรูปทรงข้อมูลจริง */
function hintIsSafe(hint: ChartType, shape: BiResultShape): boolean {
  // ข้อมูลระดับรายการต้องเป็นตารางเสมอ (ห้ามสรุปเป็นกราฟ)
  if (shape.isDetailGrain) return hint === "table";
  // ตัวเลขเดียวพล็อตเป็นกราฟไม่ได้
  if (isSingleValue(shape)) return hint === "stat" || hint === "table";
  // stat ต้องมีค่าเดียวเท่านั้น
  if (hint === "stat") return false;
  // donut อ่านไม่ออกเมื่อกลุ่มเยอะ (§3.3)
  if (hint === "donut" && shape.rowCount > DONUT_LIMIT) return false;
  return true;
}

function isSingleValue(shape: BiResultShape): boolean {
  return shape.rowCount <= 1 && shape.dimensionCount === 0;
}

/** เลือกชนิดกราฟตามตาราง §3.3 (hint ของ metric override ได้ถ้าไม่ขัดรูปทรงข้อมูล) */
export function chooseChart(
  shape: BiResultShape,
  chartHint?: ChartType | string | null,
): BiChartChoice {
  const base = chooseByShape(shape);
  if (
    chartHint &&
    isChartType(chartHint) &&
    chartHint !== base.type &&
    hintIsSafe(chartHint, shape)
  ) {
    return {
      ...base,
      type: chartHint,
      stacked: chartHint === "stacked_bar" ? true : undefined,
      top_n: chartHint === "bar" ? base.top_n : undefined,
      source: "hint",
      reason: `chart_hint ของ metric (${chartHint}) override รูปทรงข้อมูล (${base.type})`,
    };
  }
  return base;
}

function chooseByShape(shape: BiResultShape): BiChartChoice {
  const shaped = (
    type: ChartType,
    reason: string,
    extra: Partial<BiChartChoice> = {},
  ): BiChartChoice => ({
    type,
    source: "shape",
    reason,
    ...extra,
  });

  // 1) แถวรายการ (grain = transaction) → ตาราง (ห้ามสรุปเป็นกราฟ · §5 data boundary)
  if (shape.isDetailGrain) return shaped("table", "grain เป็นรายการ (drill-down)");

  // 2) ตัวเลขเดียว → stat
  if (isSingleValue(shape)) return shaped("stat", "ผลลัพธ์เป็นตัวเลขเดียว");

  // 3) สองมิติ × เวลา → stacked bar
  if (shape.hasTimeDimension && shape.dimensionCount >= 2)
    return shaped("stacked_bar", "สองมิติ × เวลา", { stacked: true });

  // 4) อนุกรมเวลา → line (หลาย measure = multi-line)
  if (shape.hasTimeDimension) return shaped("line", "อนุกรมเวลา");

  // 5) ขั้นตอน/สถานะเป็นลำดับ → funnel
  if (shape.isSequentialStage) return shaped("funnel", "มิติเป็นขั้นตอนที่มีลำดับ");

  // 6) มิติเดียวแต่หลาย measure → ตาราง (+ แถบ inline)
  if (shape.dimensionCount === 1 && shape.measureCount > 1)
    return shaped("table", "มิติเดียวแต่มีหลาย measure");

  // 7) สัดส่วนของทั้งหมด ≤ 5 กลุ่ม → donut
  if (shape.isPartToWhole && shape.rowCount <= DONUT_LIMIT)
    return shaped("donut", `สัดส่วนของทั้งหมด ≤ ${DONUT_LIMIT} กลุ่ม`);

  // 8) หมวดหมู่ ≤ 8 กลุ่ม → bar
  if (shape.rowCount <= CATEGORY_LIMIT) return shaped("bar", `หมวดหมู่ ≤ ${CATEGORY_LIMIT} กลุ่ม`);

  // 9) หมวดหมู่ > 8 กลุ่ม → bar top-N + "อื่น ๆ"
  return shaped(
    "bar",
    `หมวดหมู่ > ${CATEGORY_LIMIT} กลุ่ม → top-${CATEGORY_LIMIT} + "${OTHER_LABEL}"`,
    {
      top_n: CATEGORY_LIMIT,
      other_label: OTHER_LABEL,
    },
  );
}

// ─── buildChartSpec ────────────────────────────────────────────────────────

export interface BuildChartSpecInput {
  shape: BiResultShape;
  /** ชื่อ metric (ใช้เป็น title ของกราฟ) */
  labelTh: string;
  unit: MetricUnit;
  unitDecimals?: number;
  /** คีย์ของแกนหมวด/เวลาใน rows (null = stat) */
  xKey?: string | null;
  /** measure ที่พล็อต — ลำดับเดียวกับที่แสดงใน legend */
  series: BiChartSeries[];
  chartHint?: ChartType | string | null;
}

/** ประกอบ `BiChartSpec` ที่ฝั่ง UI เอาไป render ได้ตรง ๆ */
export function buildChartSpec(input: BuildChartSpecInput): BiChartSpec {
  const choice = chooseChart(input.shape, input.chartHint);
  const decimals =
    Number.isFinite(input.unitDecimals) && (input.unitDecimals as number) >= 0
      ? Math.trunc(input.unitDecimals as number)
      : defaultDecimals(input.unit);

  return {
    type: choice.type,
    title: input.labelTh,
    x: choice.type === "stat" ? null : (input.xKey ?? null),
    series: input.series,
    unit: input.unit,
    decimals,
    ...(choice.top_n
      ? { top_n: choice.top_n, other_label: choice.other_label ?? OTHER_LABEL }
      : {}),
    ...(choice.stacked ? { stacked: true } : {}),
  };
}

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

/**
 * ยุบกลุ่มส่วนเกินเป็น "อื่น ๆ" ตาม top-N (ใช้เมื่อ `spec.top_n` มีค่า)
 * — รวมยอดของกลุ่มที่เหลือ **ไม่ทิ้งข้อมูล** (ยอดรวมของกราฟต้องเท่ากับยอดรวมจริงเสมอ)
 */
export function collapseToTopN<T extends Record<string, unknown>>(
  rows: T[],
  opts: { labelKey: string; valueKey: string; topN: number; otherLabel?: string },
): Array<Record<string, unknown>> {
  const { labelKey, valueKey, topN } = opts;
  if (rows.length <= topN) return [...rows];

  const sorted = [...rows].sort((a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0));
  const head = sorted.slice(0, topN);
  const restTotal = sorted.slice(topN).reduce((sum, r) => sum + (Number(r[valueKey]) || 0), 0);

  return [...head, { [labelKey]: opts.otherLabel ?? OTHER_LABEL, [valueKey]: restTotal }];
}
