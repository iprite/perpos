/**
 * lib/bi/runner.ts — สเต็ป "ตรวจพารามิเตอร์ + รัน metric" (contract §2 ข้อ 4)
 *
 * กฎที่บังคับที่ชั้นนี้:
 *  - **key นอก allowlist = reject ทันที ไม่ fallback เงียบ** (§3.2) — ผู้ใช้ต้องรู้ว่าถามในมิติที่ยังไม่มี
 *  - ช่วงเวลาเกิน `max_period_months` → ตัดพร้อมแจ้ง (ห้ามตัดเงียบ · §5)
 *  - `p_org_id` มาจากผลของ `requireBiMember` เท่านั้น — ห้ามรับจาก body ตรง ๆ (§5 org isolation)
 *  - aggregate ที่ SQL เสมอ ห้ามรวมยอดใน JS (§3.1 ข้อ 3)
 */

import type { createAdminClient } from "@/app/api/_lib/supabase";
import type { BiResultShape } from "./chart";
import {
  capPeriod,
  comparisonPeriod,
  resolveExplicitPeriod,
  resolvePeriod,
  type BiPeriod,
} from "./period";
import type { BiMetricCandidate } from "./resolver";
import type { BiIntentParams } from "./intent";
import {
  isTimeGrain,
  type BiMetricParams,
  type BiRole,
  type Comparison,
  type MetricUnit,
  type TimeGrain,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/** จำนวนแถวสูงสุดที่ RPC ยอมคืน (ตรงกับเพดานใน migration) */
export const MAX_ROWS = 1000;
/** คีย์คอลัมน์ของมิติที่ทุก sql_template ต้องคืน */
export const DIMENSION_KEY = "dimension";
/** คีย์คอลัมน์ measure หลักที่ทุก sql_template ต้องคืน */
export const VALUE_KEY = "value";

export type ValidateParamsResult =
  | {
      ok: true;
      /** params ที่ผ่านการตรวจแล้ว (ใช้แสดงใน panel "ดูวิธีคำนวณ") */
      params: BiMetricParams;
      period: BiPeriod | null;
      comparePeriod: BiPeriod | null;
      /** payload ที่ส่งเข้า RPC `run_bi_metric` */
      rpcParams: Record<string, unknown>;
      /** ข้อความเตือนที่ต้องแสดงให้ผู้ใช้เห็น (เช่น ช่วงเวลาถูกตัด) */
      notices: string[];
    }
  | { ok: false; error: string };

export interface ValidateParamsOptions {
  /** วันอ้างอิง (เทสส่งเข้ามาเพื่อให้ผลคงที่) */
  today?: Date | string;
}

/**
 * ตรวจ params เทียบ allowlist ของ metric (`dimensions`/`time_grains`/`comparisons`/`filters`)
 * แล้ว resolve ช่วงเวลาเป็นวันที่จริงพร้อม cap ตาม `max_period_months`
 */
export function validateParams(
  metric: BiMetricCandidate,
  params: BiIntentParams,
  opts: ValidateParamsOptions = {},
): ValidateParamsResult {
  const notices: string[] = [];
  const clean: BiMetricParams = {};

  // ---- dimension ----
  if (params.dimension !== undefined && params.dimension !== null) {
    const dim = metric.dimensions.find((d) => d.key === params.dimension);
    if (!dim) {
      return {
        ok: false,
        error: `ยังไม่รองรับการแยกตาม "${params.dimension}" สำหรับ ${metric.label_th} · มิติที่ใช้ได้: ${describeList(metric.dimensions.map((d) => d.label_th))}`,
      };
    }
    clean.dimension = dim.key;
  }

  // ---- time_grain ----
  if (params.time_grain !== undefined && params.time_grain !== null) {
    if (!isTimeGrain(params.time_grain) || !metric.time_grains.includes(params.time_grain)) {
      return {
        ok: false,
        error: `ยังไม่รองรับการดูเป็นราย "${params.time_grain}" สำหรับ ${metric.label_th}`,
      };
    }
    clean.time_grain = params.time_grain;
  }

  // ---- comparison ----
  const comparison: Comparison = params.comparison ?? "none";
  if (comparison !== "none") {
    if (comparison === "target") {
      return { ok: false, error: "ยังไม่รองรับการเทียบกับเป้า (ระบบยังไม่มีที่เก็บเป้าหมาย)" };
    }
    if (!metric.comparisons.includes(comparison)) {
      return { ok: false, error: `${metric.label_th} ยังไม่รองรับการเปรียบเทียบแบบที่ขอ` };
    }
  }
  clean.comparison = comparison;

  // ---- filters ----
  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    const def = metric.filters.find((f) => f.key === key);
    if (!def) {
      return {
        ok: false,
        error: `ยังไม่รองรับการกรองด้วย "${key}" สำหรับ ${metric.label_th} · ตัวกรองที่ใช้ได้: ${describeList(metric.filters.map((f) => f.label_th))}`,
      };
    }
    if (value === null || value === undefined) continue;
    filters[key] = value;
  }
  if (Object.keys(filters).length) clean.filters = filters;

  // ---- period ----
  const snapshotOnly = isSnapshotMetric(metric);
  let period: BiPeriod | null = null;

  if (params.period) {
    if (snapshotOnly) {
      notices.push(
        `${metric.label_th} เป็นภาพ ณ ปัจจุบัน (ไม่อิงช่วงเวลา) — ระบบไม่ได้ใช้ช่วงเวลาที่ระบุ`,
      );
    } else if (params.period.from && params.period.to) {
      period = resolveExplicitPeriod(
        params.period.from,
        params.period.to,
        metric.max_period_months,
        params.period.grain,
      );
    } else {
      period = resolvePeriod({
        grain: params.period.grain,
        offset: params.period.offset,
        today: opts.today,
        maxPeriodMonths: metric.max_period_months,
      });
    }
  } else if (!snapshotOnly) {
    const dv = defaultPeriodOf(metric);
    if (dv) {
      period = resolvePeriod({
        grain: dv.grain,
        offset: dv.offset,
        today: opts.today,
        maxPeriodMonths: metric.max_period_months,
      });
    }
  }

  if (period) {
    period = capPeriod(period, metric.max_period_months);
    if (period.capped) {
      notices.push(
        `ช่วงเวลาที่ขอเกินเพดานของตัวชี้วัดนี้ (${metric.max_period_months} เดือน) ระบบจึงตัดให้พอดีเพดาน`,
      );
    }
    clean.period = {
      grain: period.grain,
      from: period.from,
      to: period.to,
    };
  }

  const comparePeriod = period ? comparisonPeriod(period, comparison) : null;

  const rpcParams: Record<string, unknown> = {
    ...(period ? { date_from: period.from, date_to: period.to } : {}),
    ...(clean.time_grain ? { time_grain: clean.time_grain } : {}),
    ...(clean.dimension ? { dimension: clean.dimension } : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
    limit: MAX_ROWS,
  };

  return { ok: true, params: clean, period, comparePeriod, rpcParams, notices };
}

/** metric ที่ไม่มีแกนเวลาเลย (snapshot) — ส่งช่วงวันที่ไปจะโดน RPC ปฏิเสธ */
export function isSnapshotMetric(metric: BiMetricCandidate): boolean {
  return metric.time_grains.length === 0 && metric.default_view?.period === "all";
}

/** ช่วงเวลาเริ่มต้นของ metric เมื่อผู้ใช้ไม่ระบุ (`default_view.period`) */
export function defaultPeriodOf(
  metric: BiMetricCandidate,
): { grain: TimeGrain; offset: number } | null {
  switch (metric.default_view?.period ?? null) {
    case "all":
      return null;
    case "this_month":
      return { grain: "month", offset: 0 };
    case "last_month":
      return { grain: "month", offset: -1 };
    case "this_quarter":
      return { grain: "quarter", offset: 0 };
    case "this_fiscal_year":
      return { grain: "fiscal_year", offset: 0 };
    case "this_year":
    default:
      return { grain: "year", offset: 0 };
  }
}

function describeList(items: string[]): string {
  return items.length ? items.join(", ") : "— (ยังไม่มี)";
}

// ─── runMetric ─────────────────────────────────────────────────────────────

/** metadata ของ metric ที่ RPC คืนกลับมาพร้อมผลลัพธ์ (แหล่งความจริงล่าสุด) */
export interface RunMetricMeta {
  key: string;
  label_th: string;
  definition_th: string;
  time_basis: string | null;
  unit: MetricUnit;
  unit_decimals: number;
  chart_hint: string | null;
  status: string;
  no_summarize: boolean;
  includes: string[];
  excludes: string[];
}

export interface RunMetricResult {
  rows: Array<Record<string, unknown>>;
  row_count: number;
  sql: string;
  elapsed_ms: number;
  truncated: boolean;
  metric: RunMetricMeta;
  effective_params: Record<string, unknown>;
}

export interface RunMetricInput {
  admin: Admin;
  /** ต้องมาจาก `requireBiMember` เท่านั้น */
  orgId: string;
  metricKey: string;
  rpcParams: Record<string, unknown>;
  /** role ของผู้ถาม — RPC เป็นด่านสุดท้ายของ RBAC (metric key มาได้หลายทาง ไม่ใช่แค่ retrieval) */
  role: BiRole;
  /**
   * ยอมให้รัน metric ที่ยังไม่ `verified` — **เฉพาะ golden test / สคริปต์ตรวจ**
   * ห้ามตั้ง true ใน path ของผู้ใช้จริงเด็ดขาด
   */
  allowDraft?: boolean;
}

/** รัน metric ผ่าน RPC `run_bi_metric` (SECURITY DEFINER, SELECT-only, bind org_id + role) */
export async function runMetric(input: RunMetricInput): Promise<RunMetricResult> {
  const { admin, orgId, metricKey } = input;
  if (!orgId) throw new Error("runMetric: ต้องมี orgId จาก session ฝั่งเซิร์ฟเวอร์");
  if (!input.role) throw new Error("runMetric: ต้องมี role ของผู้ถาม");

  const call = (params: Record<string, unknown>) =>
    admin.rpc("run_bi_metric", {
      p_org_id: orgId,
      p_metric_key: metricKey,
      p_params: params,
      p_role: input.role,
      p_allow_draft: input.allowDraft === true,
    });

  let { data, error } = await call(input.rpcParams);

  // metric แบบ snapshot ไม่รับช่วงวันที่ — ลองซ้ำโดยตัดวันที่ออก (ไม่เงียบ: caller เห็นจาก effective_params)
  if (
    error &&
    /snapshot/.test(error.message) &&
    ("date_from" in input.rpcParams || "date_to" in input.rpcParams)
  ) {
    const retry = { ...input.rpcParams };
    delete retry.date_from;
    delete retry.date_to;
    ({ data, error } = await call(retry));
  }

  if (error) throw new Error(`run_bi_metric: ${error.message}`);
  return normalizeRunResult(data);
}

/**
 * แปลง error ดิบจาก RPC → สถานะ + ข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง
 * (ห้ามปล่อยข้อความ SQL/ชื่อคอลัมน์ขึ้นหน้าจอ — ทั้งเรื่อง UX และไม่รั่ว schema)
 */
export function classifyRunError(message: string): {
  status: "refused" | "error";
  text: string;
} {
  const m = message ?? "";
  if (/allowed_roles|ไม่มีสิทธิ์|สิทธิ์|role/i.test(m)) {
    return {
      status: "refused",
      text: "บทบาทของคุณยังไม่มีสิทธิ์ดูตัวชี้วัดนี้ กรุณาติดต่อผู้ดูแลระบบขององค์กร",
    };
  }
  if (/verified|ยืนยัน|draft|ถูกยกเลิก|deprecated/i.test(m)) {
    return {
      status: "refused",
      text: "ยังไม่มีนิยามที่ยืนยันสำหรับคำถามนี้ จึงยังตอบเป็นตัวเลขให้ไม่ได้",
    };
  }
  if (/allowlist|ไม่อยู่ใน|ไม่รองรับ|ไม่รู้จัก metric/i.test(m)) {
    return {
      status: "error",
      text: "คำถามนี้อยู่นอกขอบเขตที่ตัวชี้วัดรองรับ กรุณาถามในมิติที่ระบบมีข้อมูล",
    };
  }
  if (/timeout|canceling statement/i.test(m)) {
    return {
      status: "error",
      text: "การคำนวณใช้เวลานานเกินกำหนด กรุณาลดช่วงเวลาหรือจำนวนมิติแล้วลองใหม่",
    };
  }
  return { status: "error", text: "คำนวณตัวเลขไม่สำเร็จ กรุณาลองใหม่ หรือแจ้งผู้ดูแลระบบ" };
}

export function normalizeRunResult(data: unknown): RunMetricResult {
  const o = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(o.rows) ? (o.rows as Array<Record<string, unknown>>) : [];
  const m = (o.metric ?? {}) as Record<string, unknown>;
  return {
    rows,
    row_count: Number(o.row_count ?? rows.length),
    sql: String(o.sql ?? ""),
    elapsed_ms: Number(o.elapsed_ms ?? 0),
    truncated: Boolean(o.truncated),
    metric: {
      key: String(m.key ?? ""),
      label_th: String(m.label_th ?? ""),
      definition_th: String(m.definition_th ?? ""),
      time_basis: (m.time_basis ?? null) as string | null,
      unit: (m.unit ?? "count") as MetricUnit,
      unit_decimals: Number(m.unit_decimals ?? 2),
      chart_hint: (m.chart_hint ?? null) as string | null,
      status: String(m.status ?? "draft"),
      no_summarize: Boolean(m.no_summarize),
      includes: Array.isArray(m.includes) ? m.includes.map(String) : [],
      excludes: Array.isArray(m.excludes) ? m.excludes.map(String) : [],
    },
    effective_params: (o.effective_params ?? {}) as Record<string, unknown>,
  };
}

// ─── รูปทรงผลลัพธ์ → ส่งให้ chooseChart ────────────────────────────────────

export interface ComputeShapeInput {
  rows: Array<Record<string, unknown>>;
  /** มิติที่ group by (null = ไม่ได้ group) */
  dimension?: string | null;
  timeGrain?: TimeGrain | null;
  metricKey: string;
  chartHint?: string | null;
}

/** ชื่อคอลัมน์ measure ทั้งหมดใน result set (คอลัมน์ที่เป็นตัวเลข) */
export function measureKeys(rows: Array<Record<string, unknown>>): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter(
    (k) => k !== DIMENSION_KEY && rows.some((r) => isNumericLike(r[k])),
  );
}

function isNumericLike(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "") return Number.isFinite(Number(v));
  return false;
}

/** แปลง result set → `BiResultShape` (อินพุตของ `chooseChart` ใน chart.ts) */
export function computeResultShape(input: ComputeShapeInput): BiResultShape {
  const { rows } = input;
  // ยึด "ข้อมูลจริง" ไม่ใช่ params — บาง template คืนคอลัมน์ dimension เองเสมอ (เช่น funnel ต่อ stage)
  const grouped = hasDimensionColumn(rows);
  const measures = measureKeys(rows);
  const isDetailGrain = input.metricKey.endsWith("_detail") || input.chartHint === "table";

  return {
    rowCount: rows.length,
    measureCount: measures.length,
    dimensionCount: grouped ? 1 : 0,
    hasTimeDimension: Boolean(input.timeGrain),
    isDetailGrain,
    isPartToWhole: input.chartHint === "donut",
    isSequentialStage: input.chartHint === "funnel" || input.dimension === "stage",
  };
}

function hasDimensionColumn(rows: Array<Record<string, unknown>>): boolean {
  return rows.some((r) => r[DIMENSION_KEY] !== undefined && r[DIMENSION_KEY] !== null);
}
