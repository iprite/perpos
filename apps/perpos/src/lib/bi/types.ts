/**
 * lib/bi/types.ts — single source of truth ฝั่ง TypeScript ของ module `bi` (BI Chat)
 *
 * ทุกชื่อในไฟล์นี้ยึดตาม contract `.claude/module-factory/specs/bi.md` §6.1/§6.2/§6.4/§6.5
 * (naming lock 🔒) — **ห้ามประกาศ enum/type เหล่านี้ซ้ำที่ไฟล์อื่น** ให้ import จากที่นี่เสมอ
 */

// ─── Enum / ค่าคงที่ (§6.2 — text + CHECK ฝั่ง DB) ──────────────────────────

/** role ของ module `bi` — canWrite: owner=true, analyst=true, viewer=false */
export const BI_ROLES = ["owner", "analyst", "viewer"] as const;
export type BiRole = (typeof BI_ROLES)[number];

export const METRIC_STATUSES = ["draft", "verified", "deprecated"] as const;
export type MetricStatus = (typeof METRIC_STATUSES)[number];

export const CHART_TYPES = [
  "stat",
  "line",
  "bar",
  "donut",
  "funnel",
  "table",
  "stacked_bar",
  "heatmap",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const TIME_GRAINS = ["day", "week", "month", "quarter", "fiscal_year", "year"] as const;
export type TimeGrain = (typeof TIME_GRAINS)[number];

export const COMPARISONS = ["none", "prev_period", "yoy", "target"] as const;
export type Comparison = (typeof COMPARISONS)[number];

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const ANSWER_SOURCES = ["web", "line"] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export const ANSWER_STATUSES = ["answered", "clarify", "no_match", "refused", "error"] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const MODULE_SCOPES = ["gov_procure", "accounting", "core"] as const;
export type ModuleScope = (typeof MODULE_SCOPES)[number];

/** หน่วยของ measure (`bi_metrics.unit`) */
export const METRIC_UNITS = ["thb", "count", "days", "percent"] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

/** feedback ที่ผู้ใช้กดต่อคำตอบ (`bi_query_log.feedback`) */
export const FEEDBACK_VALUES = ["up", "down"] as const;
export type FeedbackValue = (typeof FEEDBACK_VALUES)[number];

// ─── type guards เล็ก ๆ (ใช้ validate payload จาก client/LLM) ────────────────

export function isChartType(v: unknown): v is ChartType {
  return typeof v === "string" && (CHART_TYPES as readonly string[]).includes(v);
}
export function isTimeGrain(v: unknown): v is TimeGrain {
  return typeof v === "string" && (TIME_GRAINS as readonly string[]).includes(v);
}
export function isComparison(v: unknown): v is Comparison {
  return typeof v === "string" && (COMPARISONS as readonly string[]).includes(v);
}
export function isBiRole(v: unknown): v is BiRole {
  return typeof v === "string" && (BI_ROLES as readonly string[]).includes(v);
}

// ─── Semantic layer (`bi_metrics` §6.1) ─────────────────────────────────────

/** มิติที่ group/filter ได้ — `column` = คอลัมน์จริง (allowlist ฝั่งเซิร์ฟเวอร์) */
export interface BiMetricDimension {
  key: string;
  label_th: string;
  column: string;
}

/**
 * ชนิดค่าของ filter — ต้องตรงกับที่ RPC `run_bi_metric` รองรับใน migration
 * (`text` · `text_list` · `number_range` · `date_range` · `boolean`)
 * `in_list` = ชื่อเดิมใน contract §6.1 คงไว้เป็น alias ของ `text_list`
 */
export type BiFilterType =
  | "text"
  | "text_list"
  | "in_list"
  | "number_range"
  | "date_range"
  | "boolean";

export interface BiMetricFilter {
  key: string;
  label_th: string;
  column: string;
  type: BiFilterType;
}

/** ช่วงเวลาตั้งต้นของ metric (§6.7) — `all` = snapshot ไม่อิงช่วงเวลา */
export const DEFAULT_VIEW_PERIODS = [
  "all",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "this_fiscal_year",
] as const;
export type DefaultViewPeriod = (typeof DEFAULT_VIEW_PERIODS)[number];

/** ค่าตั้งต้นเมื่อผู้ใช้ไม่ระบุ (`bi_metrics.default_view`) */
export interface BiDefaultView {
  time_grain?: TimeGrain;
  /** ช่วงเวลาตั้งต้น — ชื่อช่วงตามที่ seed ใช้จริง (ไม่ใช่ offset ตัวเลข) */
  period?: DefaultViewPeriod;
  dimension?: string | null;
  chart_type?: ChartType;
}

/** หนึ่งแถวใน `bi_metrics` (semantic layer) */
export interface BiMetric {
  id: string;
  /** `<module_scope>.<measure_snake_case>` (§6.6) */
  key: string;
  label_th: string;
  definition_th: string;
  includes: string[];
  excludes: string[];
  grain: string;
  /** ชื่อคอลัมน์วันที่จริงที่ยึด · null = snapshot ไม่อิงเวลา */
  time_basis: string | null;
  unit: MetricUnit;
  unit_decimals: number;
  synonyms: string[];
  sql_template: string;
  param_schema: Record<string, unknown>;
  dimensions: BiMetricDimension[];
  time_grains: TimeGrain[];
  comparisons: Comparison[];
  filters: BiMetricFilter[];
  default_view: BiDefaultView;
  chart_hint: ChartType | null;
  module_scope: ModuleScope;
  allowed_roles: BiRole[];
  owner_label: string | null;
  status: MetricStatus;
  /** true = ห้ามส่ง result set เข้า LLM สรุป (§5 data boundary) */
  no_summarize: boolean;
  max_period_months: number;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * มิติที่โชว์ให้ผู้ใช้เห็นในหน้า "ถามอะไรได้บ้าง" — **ไม่มี `column`** โดยตั้งใจ
 * (ชื่อคอลัมน์จริงเป็นรายละเอียดฝั่งเซิร์ฟเวอร์ ไม่ต้องหลุดออกไปหน้าเว็บ)
 */
export type BiMetricSummaryDimension = Pick<BiMetricDimension, "key" | "label_th">;

/** metric ที่ผู้ใช้เห็นได้ (payload ของ `GET /api/bi/metrics`) */
export interface BiMetricSummary {
  key: string;
  label_th: string;
  definition_th: string;
  chart_hint: ChartType | null;
  module_scope: ModuleScope;
  /** หน่วยของ measure — ให้ UI บอกได้ว่าตัวเลขนี้เป็นบาท/จำนวน/วัน/เปอร์เซ็นต์ */
  unit: MetricUnit;
  unit_decimals: number;
  /** มิติที่แยกดูได้ (group by) — หัวใจของการทำให้ semantic layer จับต้องได้ */
  dimensions: BiMetricSummaryDimension[];
  /** ความละเอียดของแกนเวลาที่รองรับ */
  time_grains: TimeGrain[];
  /** คอลัมน์วันที่ที่ยึด (null = snapshot ไม่อิงเวลา) */
  time_basis: string | null;
  status: MetricStatus;
}

// ─── Params ที่ LLM เลือกได้ (enum key เท่านั้น — ไม่ใช่ SQL) ───────────────

/** ช่วงเวลาที่ผู้ใช้/LLM ระบุ — resolve เป็นวันที่จริงด้วย `lib/bi/period.ts` */
export interface BiPeriodParam {
  grain: TimeGrain;
  /** 0 = ช่วงปัจจุบัน, -1 = ช่วงก่อนหน้า, -2 = ย้อนสองช่วง … */
  offset?: number;
  /** ระบุช่วงเองแบบ ISO date (CE, inclusive) — ถ้ามีจะชนะ grain/offset */
  from?: string;
  to?: string;
}

export interface BiMetricParams {
  period?: BiPeriodParam;
  /** grain ของแกนเวลาในผลลัพธ์ (group by ตามเวลา) */
  time_grain?: TimeGrain;
  /** key ของมิติที่ group by (ต้องอยู่ใน `BiMetric.dimensions`) */
  dimension?: string | null;
  comparison?: Comparison;
  /** key ของ filter → ค่า (ต้องอยู่ใน `BiMetric.filters`) */
  filters?: Record<string, unknown>;
  limit?: number;
}

// ─── Chart spec (§3.3) ─────────────────────────────────────────────────────

export interface BiChartSeries {
  /** คีย์คอลัมน์ใน `rows` */
  key: string;
  label_th: string;
}

export interface BiChartSpec {
  type: ChartType;
  title: string;
  /** คีย์ของแกนหมวด/เวลา (null สำหรับ stat) */
  x: string | null;
  /** measure ที่พล็อต */
  series: BiChartSeries[];
  unit: MetricUnit;
  decimals: number;
  /** ใช้เมื่อ bar top-N — จำนวนกลุ่มที่แสดงก่อนยุบเป็น "อื่น ๆ" */
  top_n?: number;
  /** label ของกลุ่มที่ถูกยุบ */
  other_label?: string;
  stacked?: boolean;
}

// ─── คำตอบ (payload ของ `POST /api/bi/ask` §6.4) ───────────────────────────

export interface BiClarifyOption {
  metric_key: string;
  label_th: string;
  definition_th: string;
}

export interface BiClarify {
  question: string;
  options: BiClarifyOption[];
}

/** panel "ดูวิธีคำนวณ" (§3.3 ข้อ 5) */
export interface BiWork {
  sql: string;
  params: BiMetricParams;
  elapsed_ms: number;
  row_count: number;
}

export interface BiAnswerMetric {
  key: string;
  label_th: string;
  definition_th: string;
  time_basis: string | null;
}

export interface BiAnswer {
  threadId: string;
  messageId: string;
  status: AnswerStatus;
  answer: { bullets: string[] };
  metric: BiAnswerMetric | null;
  params: BiMetricParams;
  chart: BiChartSpec | null;
  rows: Array<Record<string, unknown>>;
  row_count: number;
  /** true = ผลถูกตัด (ห้ามคิดยอดรวมจากชุดนี้ — AGENTS §Conventions) */
  truncated: boolean;
  /** บรรทัด "นิยาม: … · ช่วงเวลา: …" ที่ต้องแสดงทุกคำตอบ (§3.1 ข้อ 5) */
  definition_line: string;
  follow_ups: string[];
  work: BiWork | null;
  clarify?: BiClarify;
}

// ─── Thread / message (`bi_threads` / `bi_messages`) ────────────────────────

export interface BiThread {
  id: string;
  org_id: string;
  created_by: string;
  title: string | null;
  last_message_at: string | null;
  /** ค่าที่ผู้ใช้เคยเลือกไว้ใน thread นี้ (D1: ฐานมูลค่า incl/excl VAT) — คอลัมน์ `bi_threads.preferences` */
  preferences: BiThreadPreferences;
  created_at: string;
  updated_at: string;
}

/** preference ระดับ thread — เลือกครั้งเดียว ใช้ต่อทั้งบทสนทนา (contract §11 D1) */
export interface BiThreadPreferences {
  vat_basis?: "incl_vat" | "excl_vat" | null;
}

/**
 * ส่วนของคำตอบที่ต้อง "แสดงซ้ำได้" เมื่อเปิดประวัติเก่า (`bi_messages.answer_meta` jsonb)
 *
 * กฎเหล็ก contract §3.1 ข้อ 5: **ทุกคำตอบต้องแสดงนิยาม + ช่วงเวลา** → `definition_line`
 * ต้องถูกเก็บและคืนกลับเสมอ แม้ metric จะเป็น `no_summarize` (ที่ถูกตัดคือค่าใน `work.params`)
 */
export interface BiAnswerMeta {
  definition_line: string;
  follow_ups: string[];
  work: BiWork | null;
  truncated: boolean;
  answer_status: AnswerStatus | null;
  /**
   * ตัวเลือกของคำตอบสถานะ `clarify` — ไม่เก็บไว้ ปุ่มจะหายเมื่อรีเฟรช/กลับมาหน้าเดิม
   * (metadata ของ metric ไม่ใช่ข้อมูลธุรกิจ จึงเก็บได้)
   */
  clarify: BiClarify | null;
}

export interface BiMessage {
  id: string;
  org_id: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  metric_key: string | null;
  params: BiMetricParams | null;
  chart_spec: BiChartSpec | null;
  result_rows: Array<Record<string, unknown>> | null;
  result_row_count: number | null;
  source: AnswerSource;
  created_by: string | null;
  created_at: string;
  /** 5 ส่วนของคำตอบที่เก็บไว้แสดงซ้ำ — null = ข้อความเก่าที่บันทึกก่อนมีคอลัมน์นี้ */
  answer_meta: BiAnswerMeta | null;
  /** 👍/👎 ที่ผู้ใช้เคยกดกับคำตอบนี้ (มาจาก `bi_query_log.feedback`) */
  feedback: FeedbackValue | null;
}
