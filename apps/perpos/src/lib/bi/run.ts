/**
 * lib/bi/run.ts — รัน metric **ตรง ๆ ไม่ผ่าน AI** (Phase 3 · P3-D2)
 *
 * ═══ เส้นทางนี้ต้องแยกขาดจากคำถามจริง (R6 — ความเสี่ยงสูงสุดของเฟสนี้) ═══════
 *  - **ห้าม reuse `askBi`** และ **ห้ามเรียก `incr_bi_usage`** — โควตา 50 คำถาม/คน/วัน
 *    คุมต้นทุน AI ซึ่งการ์ด/drill-down ไม่ได้ใช้เลย
 *  - นับด้วย `incr_bi_dashboard_usage` **ต่อคำขอ ไม่ใช่ต่อการ์ด** (route เป็นคนเรียก)
 *  - log ลง `bi_query_log` ด้วย `source='dashboard'` (`question` = metric key, token/cost = 0)
 *    ⇒ Phase 4 กรอง `source='web'` เพื่อดู loop คำถามจริงได้
 *  - `p_role` = role ของ **คนที่กำลังดู** เสมอ (ไม่ใช่ role ของคนที่ปักหมุด) · `allowDraft` = false
 *
 * degrade: RPC/enum ใหม่ยังไม่ลง prod ได้ → นับโควตาไม่สำเร็จ/log ไม่สำเร็จ = **ไม่ทำให้การ์ดพัง**
 */

import type { createAdminClient } from "@/app/api/_lib/supabase";
import { buildChartSpec } from "./chart";
import { buildDefinitionLine } from "./answer";
import { normalizeCandidates, resolveOrgScopes, type BiMetricCandidate } from "./resolver";
import {
  computeResultShape,
  measureKeys,
  runMetric as defaultRunMetric,
  validateParams,
  DIMENSION_KEY,
  VALUE_KEY,
  type RunMetricResult,
} from "./runner";
import {
  CARD_STATE_MESSAGES,
  type BiCardResult,
  type BiCardState,
  type BiCompare,
  type BiDashboardItem,
  type BiDirectResult,
  type BiMetricParams,
  type BiRole,
  type ModuleScope,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/** จำนวนการ์ดที่รันพร้อมกันในหนึ่งคำขอ */
export const CARD_CONCURRENCY = 6;
/** เพดานการเปิดแดชบอร์ด/รันตรงต่อคนต่อวัน (คุมภาระ DB ไม่ใช่ต้นทุน AI) */
export const DASHBOARD_DAILY_LIMIT = 200;

const METRIC_COLS =
  "key, label_th, definition_th, synonyms, dimensions, time_grains, comparisons, filters, " +
  "default_view, chart_hint, unit, unit_decimals, param_schema, max_period_months, no_summarize, time_basis";

/** error ของการรันการ์ด/รันตรง — พก `state` ที่ UI ใช้เลือกข้อความไทยมาด้วย */
export class BiRunError extends Error {
  readonly state: Exclude<BiCardState, "ok">;
  constructor(state: Exclude<BiCardState, "ok">, message: string) {
    super(message);
    this.name = "BiRunError";
    this.state = state;
  }
  /** ข้อความไทยมาตรฐานที่แสดงได้ (ไม่รั่ว schema/ชื่อคอลัมน์) */
  get userMessage(): string {
    return CARD_STATE_MESSAGES[this.state];
  }
}

/** แปลง error ดิบจาก RPC → สถานะการ์ด (คู่กับ `classifyRunError` ที่ให้ข้อความไทย) */
export function cardStateFromError(message: string): Exclude<BiCardState, "ok"> {
  const m = message ?? "";
  if (/allowed_roles|ไม่มีสิทธิ์|สิทธิ์|role/i.test(m)) return "forbidden";
  if (/verified|ยืนยัน|draft|deprecated|ถูกยกเลิก|ไม่รู้จัก metric|not found/i.test(m)) {
    return "metric_unavailable";
  }
  return "error";
}

// ─── โหลด metric ที่ผู้ดู "เห็นได้จริง" ─────────────────────────────────────

export interface LoadRunMetricInput {
  admin: Admin;
  metricKey: string;
  role: BiRole;
  scopes: ModuleScope[];
}

/**
 * metric ตาม key — กรอง `verified` + `module_scope` ที่ org เปิด + `allowed_roles` ของ **ผู้ดู**
 * (ด่านเดียวกับชั้น retrieval · RPC `run_bi_metric` ยังเป็นด่านสุดท้ายอีกชั้น)
 */
export async function loadRunMetric(input: LoadRunMetricInput): Promise<BiMetricCandidate | null> {
  if (!input.metricKey || input.scopes.length === 0) return null;

  const { data, error } = await input.admin
    .from("bi_metrics")
    .select(METRIC_COLS)
    .eq("key", input.metricKey)
    .eq("status", "verified")
    .in("module_scope", input.scopes)
    .contains("allowed_roles", [input.role])
    .maybeSingle();
  if (error) throw new Error(`loadRunMetric: ${error.message}`);
  if (!data) return null;

  const [candidate] = normalizeCandidates([{ ...(data as object), similarity: 1 }]);
  return candidate ?? null;
}

// ─── runDirect ─────────────────────────────────────────────────────────────

export interface RunDirectInput {
  admin: Admin;
  /** ต้องมาจากผลของ `requireBiMember`/guard ฝั่งหน้าเท่านั้น */
  orgId: string;
  profileId: string;
  /** role ของ **คนที่กำลังดู** */
  role: BiRole;
  metricKey: string;
  params?: BiMetricParams | null;
  /**
   * ชนิดกราฟที่ผู้ใช้เลือกไว้บนการ์ด = **ข้อเสนอเท่านั้น** (R10)
   * — ยังต้องผ่าน `chooseChart` ที่ veto ได้ 3 กรณี (detail grain / ค่าเดียว / donut กลุ่มเยอะ)
   */
  chartType?: string | null;
  /** scope ที่ org เปิด — ไม่ส่ง = resolve ให้ (ส่งมาช่วยลด query เวลารันหลายการ์ด) */
  scopes?: ModuleScope[];
  /** วันอ้างอิง (เทส) */
  today?: Date;
  /** ทดสอบ: แทนที่ตัวรัน RPC / ตัวโหลด metric */
  runMetric?: typeof defaultRunMetric;
  loadMetric?: typeof loadRunMetric;
  /** false = ไม่ต้อง log ลง `bi_query_log` (เทส) */
  log?: boolean;
}

/**
 * รัน metric หนึ่งตัวแล้วคืนผลพร้อมกราฟ + บรรทัดนิยาม — **ไม่เรียก LLM เลย**
 * โยน `BiRunError` เมื่อ metric ถูกปิด / ไม่มีสิทธิ์ / params ผิด
 */
export async function runDirect(input: RunDirectInput): Promise<BiDirectResult> {
  const t0 = Date.now();
  const admin = input.admin;
  const scopes = input.scopes ?? (await resolveOrgScopes(admin, input.orgId));

  const metric = await (input.loadMetric ?? loadRunMetric)({
    admin,
    metricKey: input.metricKey,
    role: input.role,
    scopes,
  });
  if (!metric) {
    // แยกไม่ออกระหว่าง "ถูกปิด" กับ "ไม่มีสิทธิ์" โดยตั้งใจ — ทั้งคู่ไม่บอกใบ้ metadata
    throw new BiRunError("metric_unavailable", `metric ไม่พร้อมใช้งาน: ${input.metricKey}`);
  }

  const validated = validateParams(metric, input.params ?? {}, { today: input.today });
  if (!validated.ok) throw new BiRunError("error", validated.error);

  const comparePeriod = validated.comparePeriod;
  const runFn = input.runMetric ?? defaultRunMetric;

  let run: RunMetricResult;
  let compareRun: RunMetricResult | null = null;
  try {
    // ช่วงเทียบยิง **ขนาน** เสมอ (ห้ามเรียง) · เทียบล้มเหลว = กลืน ผลหลักต้องออก
    [run, compareRun] = await Promise.all([
      runFn({
        admin,
        orgId: input.orgId,
        metricKey: metric.key,
        rpcParams: validated.rpcParams,
        role: input.role,
        allowDraft: false,
      }),
      comparePeriod
        ? runFn({
            admin,
            orgId: input.orgId,
            metricKey: metric.key,
            rpcParams: {
              ...validated.rpcParams,
              date_from: comparePeriod.from,
              date_to: comparePeriod.to,
            },
            role: input.role,
            allowDraft: false,
          }).catch((e: Error) => {
            console.error("[bi] compare run failed:", e.message);
            return null;
          })
        : Promise.resolve(null),
    ]);
  } catch (e) {
    const message = (e as Error).message;
    await logDashboardQuery(input, {
      metricKey: metric.key,
      params: validated.params,
      status: "error",
      latencyMs: Date.now() - t0,
      rowCount: null,
      sqlMs: null,
      errorMessage: message,
    });
    throw new BiRunError(cardStateFromError(message), message);
  }

  if (run.metric.status !== "verified") {
    throw new BiRunError("metric_unavailable", `metric status = ${run.metric.status}`);
  }

  const shape = computeResultShape({
    rows: run.rows,
    dimension: validated.params.dimension ?? null,
    timeGrain: validated.params.time_grain ?? null,
    metricKey: metric.key,
    chartHint: run.metric.chart_hint,
  });
  const chart = buildChartSpec({
    shape,
    labelTh: run.metric.label_th || metric.label_th,
    unit: run.metric.unit,
    unitDecimals: run.metric.unit_decimals,
    xKey: shape.dimensionCount > 0 ? DIMENSION_KEY : null,
    series: seriesOf(run.rows, run.metric.label_th || metric.label_th),
    // ผู้ใช้เลือกทับได้ แต่ `chooseChart` ยัง veto กรณีที่ขัดรูปทรงข้อมูลเสมอ
    chartHint: input.chartType ?? run.metric.chart_hint,
  });

  const compare: BiCompare | null =
    compareRun && comparePeriod
      ? {
          label_th: comparePeriod.label_th,
          from: comparePeriod.from,
          to: comparePeriod.to,
          rows: compareRun.rows,
          row_count: compareRun.row_count,
        }
      : null;

  await logDashboardQuery(input, {
    metricKey: metric.key,
    params: validated.params,
    status: "answered",
    latencyMs: Date.now() - t0,
    rowCount: run.row_count,
    sqlMs: run.elapsed_ms,
    errorMessage: null,
  });

  return {
    metric: {
      key: metric.key,
      label_th: run.metric.label_th || metric.label_th,
      definition_th: run.metric.definition_th || metric.definition_th,
      time_basis: run.metric.time_basis,
      unit: run.metric.unit,
      unit_decimals: run.metric.unit_decimals,
    },
    params: validated.params,
    chart,
    rows: run.rows,
    row_count: run.row_count,
    truncated: run.truncated,
    // กฎเหล็ก §3.1 ข้อ 5 — บรรทัดนิยาม + ช่วงเวลาต้องมาพร้อมตัวเลขเสมอ (การ์ดก็ไม่ยกเว้น)
    definition_line: buildDefinitionLine(run.metric, validated.period, comparePeriod),
    work: {
      sql: run.sql,
      params: validated.params,
      elapsed_ms: run.elapsed_ms,
      row_count: run.row_count,
    },
    compare,
  };
}

// ─── runCards ──────────────────────────────────────────────────────────────

export interface RunCardsInput {
  admin: Admin;
  orgId: string;
  profileId: string;
  /** role ของคนที่กำลังเปิดแดชบอร์ด — **ไม่ใช่** role ของคนที่ปักหมุด */
  role: BiRole;
  items: BiDashboardItem[];
  scopes?: ModuleScope[];
  today?: Date;
  runMetric?: typeof defaultRunMetric;
  loadMetric?: typeof loadRunMetric;
  log?: boolean;
}

/**
 * รันทุกการ์ดในคำขอเดียว — การ์ดที่พังไม่ทำให้ใบอื่นพัง
 * ⚠️ เมื่อ `state !== 'ok'` คืนเฉพาะ `title` + ข้อความมาตรฐาน (§3 ข้อ 2)
 * **ห้ามคืน `metric_key`/`label_th`/`definition_th`** ที่บอกใบ้ metric ที่ผู้ดูไม่มีสิทธิ์เห็น
 */
export async function runCards(input: RunCardsInput): Promise<BiCardResult[]> {
  const items = input.items ?? [];
  if (items.length === 0) return [];

  const scopes = input.scopes ?? (await resolveOrgScopes(input.admin, input.orgId));
  const results: BiCardResult[] = new Array(items.length);

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await runOneCard(input, items[index], scopes);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CARD_CONCURRENCY, items.length) }, () => worker()),
  );

  return results;
}

async function runOneCard(
  input: RunCardsInput,
  item: BiDashboardItem,
  scopes: ModuleScope[],
): Promise<BiCardResult> {
  try {
    const result = await runDirect({
      admin: input.admin,
      orgId: input.orgId,
      profileId: input.profileId,
      role: input.role,
      metricKey: item.metric_key,
      params: item.params,
      chartType: item.chart_type,
      scopes,
      today: input.today,
      runMetric: input.runMetric,
      loadMetric: input.loadMetric,
      log: input.log,
    });
    return { itemId: item.id, state: "ok", title: item.title, result, message: null };
  } catch (e) {
    const state = e instanceof BiRunError ? e.state : cardStateFromError((e as Error).message);
    console.error(`[bi] card ${item.id} failed (${state}):`, (e as Error).message);
    return {
      itemId: item.id,
      state,
      title: item.title,
      result: null,
      message: CARD_STATE_MESSAGES[state],
    };
  }
}

// ─── โควตา + log ───────────────────────────────────────────────────────────

/**
 * `true` เมื่อ error แปลว่า **RPC ยังไม่ถูกติดตั้ง** (SQLSTATE 42883 undefined_function
 * หรือ PostgREST หา function ใน schema cache ไม่เจอ) — กรณีเดียวที่ยอม fail-open
 */
function isMissingRpc(err: { code?: string | null; message?: string | null } | null): boolean {
  const code = err?.code ?? "";
  if (code === "42883" || code === "PGRST202") return true;
  const msg = err?.message ?? "";
  return /undefined_function|does not exist|could not find the function/i.test(msg);
}

/**
 * นับการเปิดแดชบอร์ด/รันตรง **หนึ่งครั้งต่อคำขอ** (ไม่ใช่ต่อการ์ด · P3-D2)
 * คืน `false` = เกินเพดานของวันนี้
 *
 * **fail-closed โดยหลัก** — RPC ล้มเหลวด้วยเหตุอื่น (timeout/สิทธิ์/เครือข่าย) ต้องกันไว้ก่อน
 * ไม่งั้นเพดาน 200/วันหายเงียบ ๆ แล้วโดนยิงรัวจน DB รับภาระเต็ม ๆ
 * ยกเว้นกรณีเดียว: RPC ยังไม่ลงฐาน (`isMissingRpc`) → ผ่าน เพื่อไม่ให้หน้าพังตอน deploy
 */
export async function incrDashboardUsage(
  admin: Admin,
  orgId: string,
  profileId: string,
  dailyLimit: number = DASHBOARD_DAILY_LIMIT,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("incr_bi_dashboard_usage", {
      p_org_id: orgId,
      p_profile_id: profileId,
      p_daily_limit: dailyLimit,
    });
    if (error) {
      if (isMissingRpc(error)) {
        console.warn("[bi] incr_bi_dashboard_usage ยังไม่ได้ติดตั้ง — ข้ามการนับโควตา");
        return true;
      }
      console.error("[bi] incr_bi_dashboard_usage failed:", error.message);
      return false;
    }
    return data !== false;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (isMissingRpc(err)) {
      console.warn("[bi] incr_bi_dashboard_usage ยังไม่ได้ติดตั้ง — ข้ามการนับโควตา");
      return true;
    }
    console.error("[bi] incr_bi_dashboard_usage failed:", err.message);
    return false;
  }
}

interface LogArgs {
  metricKey: string;
  params: BiMetricParams;
  status: "answered" | "error";
  latencyMs: number;
  rowCount: number | null;
  sqlMs: number | null;
  errorMessage: string | null;
}

/**
 * log การรันการ์ด — `source='dashboard'` เท่านั้น (ห้ามปนกับคำถามจริง)
 * `question` = metric key (ไม่ใช่ข้อความผู้ใช้) · token/cost = 0 เพราะไม่ได้เรียก LLM
 */
async function logDashboardQuery(input: RunDirectInput, args: LogArgs): Promise<void> {
  if (input.log === false) return;
  try {
    const { error } = await input.admin.from("bi_query_log").insert({
      org_id: input.orgId,
      profile_id: input.profileId,
      thread_id: null,
      message_id: null,
      source: "dashboard",
      question: args.metricKey,
      matched_metric_key: args.metricKey,
      match_score: null,
      params: args.params,
      answer_status: args.status,
      result_row_count: args.rowCount,
      latency_ms: args.latencyMs,
      sql_ms: args.sqlMs,
      model: null,
      token_in: 0,
      token_out: 0,
      cost_usd: 0,
      error_message: args.errorMessage,
    });
    // CHECK ใหม่ (`source='dashboard'`) ยังไม่ลง = ข้าม log ไปเฉย ๆ
    // **ห้ามถอยไปเขียน `source='web'`** เพราะจะทำให้ feed คำถามจริงของ Phase 4 เพี้ยน
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[bi] bi_query_log (dashboard) insert failed:", (e as Error).message);
  }
}

/** measure ที่จะพล็อต — `value` มาก่อนเสมอ ตามสัญญาของ sql_template */
function seriesOf(rows: Array<Record<string, unknown>>, label: string) {
  const keys = measureKeys(rows);
  if (keys.length === 0) return [{ key: VALUE_KEY, label_th: label }];
  const ordered = keys.includes(VALUE_KEY)
    ? [VALUE_KEY, ...keys.filter((k) => k !== VALUE_KEY)]
    : keys;
  return ordered.map((k) => ({ key: k, label_th: k === VALUE_KEY ? label : k }));
}
