/**
 * lib/bi/resolver.ts — สเต็ป "หา metric ที่ตรงคำถาม" (contract §2 ข้อ 3)
 *
 * embed คำถาม (gemini-embedding-001, RETRIEVAL_QUERY, 768) → RPC `match_bi_metrics`
 *
 * กติกาความปลอดภัยที่บังคับที่ชั้นนี้ (§5):
 *  - **RBAC ระดับ metric กรองที่ชั้น retrieval** — ส่ง `p_role` ของผู้ถามเสมอ
 *    role ที่ไม่มีสิทธิ์ต้อง "หาไม่เจอ" ไม่ใช่เห็นแล้วถูกบัง
 *  - `p_scopes` = module ที่ **org นั้นเปิดจริง** (อ่านจาก `org_module_settings`)
 *    → org ที่ไม่ได้เปิด accounting จะไม่มีวัน match metric ฝั่ง accounting
 *  - RPC กรอง `status='verified'` ให้แล้ว (metric `draft` ตอบไม่ได้) — `ask.ts` เช็คซ้ำอีกชั้น
 */

import { aiEmbed } from "@/lib/ai/client";
import type { createAdminClient } from "@/app/api/_lib/supabase";
import type {
  BiDefaultView,
  BiMetricDimension,
  BiMetricFilter,
  BiRole,
  ChartType,
  Comparison,
  MetricUnit,
  ModuleScope,
  TimeGrain,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/** จำนวน metric ที่ดึงมาให้ LLM เลือก (มากไป = prompt แพง, น้อยไป = พลาด) */
export const MATCH_COUNT = 5;
/** คะแนนต่ำกว่านี้ถือว่า "ไม่เกี่ยวข้อง" — ตอบไม่ได้ ดีกว่าตอบมั่ว (§3.1 ข้อ 4) */
export const MIN_SIMILARITY = 0.6;
/** ผลต่างคะแนนที่ถือว่า "ใกล้กันจนต้องถามกลับ" (§3.1 ข้อ 4) */
export const AMBIGUOUS_GAP = 0.03;
/**
 * เกณฑ์ขั้นต่ำสำหรับ "ข้อเสนอ" ที่โชว์ให้ผู้ใช้เลือก (สูงกว่าเกณฑ์รับ candidate)
 *
 * ผ่าน `MIN_SIMILARITY` แค่พอให้ระบบ "พิจารณา" ได้ แต่ยังไม่พอที่จะเอาไปเสนอหน้าจอ
 * (QA เจอ: ถาม "top หมวดครุภัณฑ์" แล้วถูกเสนอ "คืนเงินต้นต่อนักลงทุน")
 * — ต่ำกว่าเกณฑ์นี้ = ไม่เสนอ ดีกว่าเสนอมั่ว
 */
export const SUGGEST_MIN_SIMILARITY = 0.68;
/**
 * ผลต่างคะแนนที่ถือว่า "อันดับ 1 นำขาด" — ตอบได้เลยไม่ต้องถามกลับ
 *
 * คำถามง่าย ๆ อย่าง "มีงานจัดซื้อกี่ใบ" มี metric ใกล้เคียงหลายตัวตามธรรมชาติ
 * ถ้าถามกลับทุกครั้งผู้ใช้ต้องกดเพิ่มโดยไม่จำเป็น (QA รอบ 2)
 * **ยกเว้นคู่ฐาน VAT (D1) ที่ต้องถามเสมอ** — ด่านนั้นอยู่หลังจุดนี้ ไม่ถูกข้าม
 */
export const DECISIVE_GAP = 0.05;

/** หนึ่งแถวที่ `match_bi_metrics` คืนมา — คือ "สัญญา" ที่ intent/runner ใช้ validate */
export interface BiMetricCandidate {
  key: string;
  label_th: string;
  definition_th: string;
  synonyms: string[];
  dimensions: BiMetricDimension[];
  time_grains: TimeGrain[];
  comparisons: Comparison[];
  filters: BiMetricFilter[];
  default_view: BiDefaultView;
  chart_hint: ChartType | null;
  unit: MetricUnit;
  param_schema: Record<string, unknown>;
  max_period_months: number;
  no_summarize: boolean;
  similarity: number;
}

export interface EmbedQuestionResult {
  values: number[];
  estimatedTokens: number;
}

/** embed คำถามของผู้ใช้ (RETRIEVAL_QUERY — ต้องคู่กับ RETRIEVAL_DOCUMENT ตอน seed) */
export async function embedQuestion(text: string): Promise<EmbedQuestionResult> {
  const res = await aiEmbed(text, "RETRIEVAL_QUERY");
  return { values: res.values, estimatedTokens: res.estimatedTokens };
}

/** module scope ที่ BI ใช้ได้ — `core` ใช้ได้กับทุก org เสมอ */
export const ALWAYS_ON_SCOPES: ModuleScope[] = ["core"];

/**
 * scope ที่ org นี้ "เปิดจริง" — กันไม่ให้ org ที่ไม่ได้ใช้ accounting
 * เจอ metric ฝั่งบัญชีตั้งแต่ชั้น retrieval
 */
export async function resolveOrgScopes(admin: Admin, orgId: string): Promise<ModuleScope[]> {
  const { data } = await admin
    .from("org_module_settings")
    .select("module_key, is_enabled")
    .eq("organization_id", orgId);

  const enabled = new Set(
    ((data ?? []) as { module_key: string; is_enabled: boolean }[])
      .filter((r) => r.is_enabled)
      .map((r) => r.module_key),
  );

  const scopes: ModuleScope[] = [...ALWAYS_ON_SCOPES];
  if (enabled.has("gov_procure")) scopes.push("gov_procure");
  if (enabled.has("accounting")) scopes.push("accounting");
  return scopes;
}

export interface MatchMetricsInput {
  admin: Admin;
  embedding: number[];
  scopes: ModuleScope[];
  role: BiRole;
  matchCount?: number;
  minSimilarity?: number;
}

/** เรียก RPC `match_bi_metrics` — verified + scope ของ org + role ของผู้ถามเท่านั้น */
export async function matchMetrics(input: MatchMetricsInput): Promise<BiMetricCandidate[]> {
  const { data, error } = await input.admin.rpc("match_bi_metrics", {
    p_query_embedding: input.embedding,
    p_scopes: input.scopes,
    p_role: input.role,
    p_match_count: input.matchCount ?? MATCH_COUNT,
    p_min_similarity: input.minSimilarity ?? MIN_SIMILARITY,
  });
  if (error) throw new Error(`match_bi_metrics: ${error.message}`);
  const candidates = normalizeCandidates(data);
  return withVatCounterparts(input.admin, candidates, input.scopes, input.role);
}

/** คีย์ฝั่งตรงข้ามของคู่ VAT (`…_incl_vat` ⇄ `…_excl_vat`) — null ถ้าไม่ใช่คู่ VAT */
export function vatCounterpartKey(key: string): string | null {
  if (key.endsWith("_incl_vat")) return `${key.slice(0, -"_incl_vat".length)}_excl_vat`;
  if (key.endsWith("_excl_vat")) return `${key.slice(0, -"_excl_vat".length)}_incl_vat`;
  return null;
}

/**
 * ดึง "คู่ VAT" ที่หลุด top-N มาต่อท้ายเสมอ (D1 §11)
 *
 * ถ้าคู่ incl/excl ติดมาแค่ตัวเดียว ระบบจะรันตัวนั้นเงียบ ๆ = **default ฐานมูลค่าให้ผู้ใช้เอง**
 * ซึ่งขัดกฎ "ห้ามเดา" — ต้องมีทั้งคู่อยู่ในชุด candidate ด่าน D1 ใน `ask.ts` ถึงจะถามกลับได้
 * (และตัวเลือกที่เสนอต้องเป็น candidate เต็มรูป ไม่งั้นเทิร์นถัดไปรันไม่ได้)
 *
 * ยิง DB เพิ่มเฉพาะกรณีมี metric ตระกูล VAT ติดมาเท่านั้น — filter เดียวกับ retrieval
 * (verified + scope ของ org + role ของผู้ถาม) จึงไม่เปิดช่องให้เห็น metric นอกสิทธิ์
 */
async function withVatCounterparts(
  admin: Admin,
  candidates: BiMetricCandidate[],
  scopes: ModuleScope[],
  role: BiRole,
): Promise<BiMetricCandidate[]> {
  const have = new Set(candidates.map((c) => c.key));
  const missing = new Map<string, number>(); // key ที่ขาด → similarity ของพี่น้องที่ติดมา
  for (const c of candidates) {
    const counterpart = vatCounterpartKey(c.key);
    if (counterpart && !have.has(counterpart) && !missing.has(counterpart)) {
      missing.set(counterpart, c.similarity);
    }
  }
  if (missing.size === 0 || scopes.length === 0) return candidates;

  const { data, error } = await admin
    .from("bi_metrics")
    .select(
      "key, label_th, definition_th, synonyms, dimensions, time_grains, comparisons, filters, default_view, chart_hint, unit, param_schema, max_period_months, no_summarize",
    )
    .in("key", Array.from(missing.keys()))
    .eq("status", "verified")
    .in("module_scope", scopes)
    .contains("allowed_roles", [role]);

  if (error) {
    // ไม่ใช่เรื่องคอขาดบาดตาย — เสียแค่โอกาสถามกลับ ไม่ควรทำให้ทั้งคำถามล้ม
    console.error("[bi] withVatCounterparts failed:", error.message);
    return candidates;
  }

  const extra = normalizeCandidates(
    (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      // similarity ต่ำกว่าพี่น้องเล็กน้อย: อยู่ในชุดให้ D1 เห็น แต่ไม่แย่งอันดับหนึ่ง
      return { ...r, similarity: Math.max((missing.get(String(r.key)) ?? 0) - 0.001, 0) };
    }),
  );

  return [...candidates, ...extra];
}

/** PostgREST คืน jsonb เป็น unknown — normalize ให้ตรง type ก่อนใช้ */
export function normalizeCandidates(rows: unknown): BiMetricCandidate[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      key: String(row.key ?? ""),
      label_th: String(row.label_th ?? ""),
      definition_th: String(row.definition_th ?? ""),
      synonyms: asStringArray(row.synonyms),
      dimensions: (Array.isArray(row.dimensions) ? row.dimensions : []) as BiMetricDimension[],
      time_grains: asStringArray(row.time_grains) as TimeGrain[],
      comparisons: asStringArray(row.comparisons) as Comparison[],
      filters: (Array.isArray(row.filters) ? row.filters : []) as BiMetricFilter[],
      default_view: (row.default_view ?? {}) as BiDefaultView,
      chart_hint: (row.chart_hint ?? null) as ChartType | null,
      unit: (row.unit ?? "count") as MetricUnit,
      param_schema: (row.param_schema ?? {}) as Record<string, unknown>,
      max_period_months: Number(row.max_period_months ?? 36),
      no_summarize: Boolean(row.no_summarize),
      similarity: Number(row.similarity ?? 0),
    };
  });
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/**
 * เจอหลายตัวคะแนนใกล้กัน → ต้องถามกลับ ไม่ใช่เดา (§3.1 ข้อ 4)
 * คืน `true` เมื่ออันดับ 1 กับ 2 ห่างกันน้อยกว่า `AMBIGUOUS_GAP`
 */
export function isAmbiguousMatch(candidates: BiMetricCandidate[]): boolean {
  if (candidates.length < 2) return false;
  return candidates[0].similarity - candidates[1].similarity < AMBIGUOUS_GAP;
}
