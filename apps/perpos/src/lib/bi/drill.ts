/**
 * lib/bi/drill.ts — drill-down: คลิกจุดบนกราฟ → รายการที่อยู่เบื้องหลังตัวเลขนั้น (P3-D3)
 *
 * ใช้ metric รายละเอียดที่ **มีอยู่แล้วและ verified** (`gov_procure.orders_detail`)
 * — ไม่สร้าง metric ใหม่ · metric นั้นติดธง `no_summarize` + `chart_hint='table'`
 * ⇒ ผลลัพธ์ **ไม่เข้า LLM · ไม่ persist `result_rows`** (ตามข้อ 4 ของ §3 และ data boundary §5)
 *
 * ถ้ามิติที่ผู้ใช้คลิก **ไม่มีใน `filters` ของ metric รายละเอียด** → คืน `null`
 * (UI ต้องไม่ให้คลิกจุดนั้น — ห้ามเดาคอลัมน์เอง)
 */

import type { BiMetricCandidate } from "./resolver";
import type { BiDrillTarget, BiMetricParams, ModuleScope } from "./types";

/** metric รายละเอียดของแต่ละ scope — `null` = scope นั้นยังไม่มี metric ระดับรายการ */
export const DETAIL_METRIC_BY_SCOPE: Record<ModuleScope, string | null> = {
  gov_procure: "gov_procure.orders_detail",
  accounting: null,
  // tmc ชุดแรกเป็น metric สรุปล้วน (ยังไม่มี metric ระดับรายการ) → เจาะลึกจากกราฟไม่ได้
  tmc: null,
  core: null,
};

/** scope ของ metric อ่านจาก prefix ของ key (`<module_scope>.<measure>` — §6.6) */
function scopeOfKey(metricKey: string): ModuleScope | null {
  const prefix = String(metricKey ?? "").split(".")[0];
  return prefix in DETAIL_METRIC_BY_SCOPE ? (prefix as ModuleScope) : null;
}

/** metric รายละเอียดที่ควรใช้เมื่อเจาะจากตัวชี้วัดนี้ — `null` = เจาะไม่ได้ */
export function detailMetricFor(metricKey: string): string | null {
  const scope = scopeOfKey(metricKey);
  if (!scope) return null;
  const detail = DETAIL_METRIC_BY_SCOPE[scope];
  // metric รายละเอียดเองไม่ต้องเจาะต่อ
  return detail && detail !== metricKey ? detail : null;
}

export interface BiDrillPoint {
  /** key ของมิติที่ group by อยู่ (เช่น `company`, `stage`) */
  dimension: string;
  /** ค่าบนแกนที่ผู้ใช้คลิก (label ของกลุ่ม) */
  value: string;
}

/**
 * params ของ metric รายละเอียด = ช่วงเวลาเดิม + ฟิลเตอร์เดิม + ฟิลเตอร์ของจุดที่คลิก
 * คืน `null` เมื่อมิติที่คลิกไม่มีใน `filters` ของ metric รายละเอียด (ห้ามเดาคอลัมน์)
 */
export function buildDrillParams(
  detailMetric: Pick<BiMetricCandidate, "key" | "filters">,
  params: BiMetricParams,
  point: BiDrillPoint,
): BiDrillTarget | null {
  const dimensionKey = String(point?.dimension ?? "").trim();
  const value = String(point?.value ?? "").trim();
  if (!dimensionKey || !value) return null;

  const def = detailMetric.filters.find((f) => f.key === dimensionKey);
  if (!def) return null;

  // ฟิลเตอร์เดิมที่ metric รายละเอียดรองรับเท่านั้น (นอก allowlist = ตัดทิ้ง ไม่ error)
  const filters: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(params.filters ?? {})) {
    if (v === null || v === undefined) continue;
    if (detailMetric.filters.some((f) => f.key === key)) filters[key] = v;
  }
  filters[dimensionKey] = def.type === "text_list" || def.type === "in_list" ? [value] : value;

  return {
    metric_key: detailMetric.key,
    params: {
      ...(params.period ? { period: params.period } : {}),
      comparison: "none",
      filters,
    },
  };
}
