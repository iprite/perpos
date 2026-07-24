/**
 * lib/bi/intent.ts — สเต็ป "ตีความคำถาม" (contract §2 ข้อ 2)
 *
 * LLM ทำได้อย่างเดียวคือ **เลือก enum key จาก allowlist ที่เราส่งไป** — ไม่เจน SQL
 * ไม่รู้จักชื่อคอลัมน์ ไม่คำนวณตัวเลข (§1.1) · ผลที่ได้ยังถูก sanitize ซ้ำที่ฝั่งเซิร์ฟเวอร์
 * ทุกครั้งก่อนใช้ (LLM ส่งคีย์แปลก ๆ มา = ถูกตัดทิ้ง ไม่ใช่หลุดเข้า runner)
 *
 * prompt: `lib/ai/prompts/bi-intent.v1.txt` (versioned ตาม CONTEXT §12)
 */

import { aiChat } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/load-prompt";
import type { BiMetricCandidate } from "./resolver";
import {
  isComparison,
  isTimeGrain,
  type BiMetricParams,
  type BiPeriodParam,
  type Comparison,
  type TimeGrain,
} from "./types";

export const BI_INTENT_PROMPT = "bi-intent";
export const BI_INTENT_PROMPT_VERSION = "v1";

/** ฐานมูลค่าตาม D1 — มูลค่าทุกตัวมี 2 metric (`…_incl_vat` / `…_excl_vat`) */
export const VAT_BASES = ["incl_vat", "excl_vat"] as const;
export type VatBasis = (typeof VAT_BASES)[number];

export function isVatBasis(v: unknown): v is VatBasis {
  return typeof v === "string" && (VAT_BASES as readonly string[]).includes(v);
}

export interface BiIntentParams extends BiMetricParams {
  /** D1 — ฐานมูลค่าที่ผู้ใช้เลือก (จำไว้ในระดับ thread) */
  vat_basis?: VatBasis | null;
}

export interface BiIntentUsage {
  tokenIn: number;
  tokenOut: number;
  model: string;
}

export interface BiIntent {
  metric_key: string | null;
  params: BiIntentParams;
  confidence: number;
  needs_clarify: boolean;
  clarify_reason: string;
  usage: BiIntentUsage;
}

export interface ExtractIntentOptions {
  /** preference ที่ thread นี้เคยเลือกไว้ (D1: เลือก VAT ครั้งเดียว ใช้ต่อทั้ง thread) */
  threadPreferences?: { vat_basis?: VatBasis | null } | null;
  /** metric + params ของคำตอบล่าสุดใน thread — ให้คำถามต่อเนื่องทำงานได้ */
  previousTurn?: { metric_key: string; params: BiMetricParams } | null;
  /** ทดสอบ: แทนที่ตัวเรียก LLM */
  chat?: typeof aiChat;
}

const EMPTY_USAGE: BiIntentUsage = { tokenIn: 0, tokenOut: 0, model: "" };

/** metric ที่ LLM เลือกได้ — ส่งเฉพาะ metadata ที่จำเป็น (prompt เล็ก = ถูกและเร็ว) */
function candidatePayload(c: BiMetricCandidate) {
  return {
    metric_key: c.key,
    ชื่อ: c.label_th,
    นิยาม: c.definition_th,
    คำที่ผู้ใช้เรียก: c.synonyms,
    มิติที่เลือกได้: c.dimensions.map((d) => ({ key: d.key, label: d.label_th })),
    ช่วงเวลาที่จัดกลุ่มได้: c.time_grains,
    การเปรียบเทียบที่รองรับ: c.comparisons,
    ตัวกรองที่ใส่ได้: c.filters.map((f) => ({ key: f.key, label: f.label_th, type: f.type })),
    หน่วย: c.unit,
  };
}

/** ตีความคำถาม → metric key + params (structured output / JSON mode) */
export async function extractIntent(
  question: string,
  candidates: BiMetricCandidate[],
  opts: ExtractIntentOptions = {},
): Promise<BiIntent> {
  if (candidates.length === 0) {
    return {
      metric_key: null,
      params: {},
      confidence: 0,
      needs_clarify: true,
      clarify_reason: "ไม่พบตัวชี้วัดที่ตรงกับคำถามนี้",
      usage: EMPTY_USAGE,
    };
  }

  const system = await loadPrompt(BI_INTENT_PROMPT, BI_INTENT_PROMPT_VERSION);
  const userContent = [
    `<candidates>\n${JSON.stringify(candidates.map(candidatePayload), null, 0)}\n</candidates>`,
    opts.threadPreferences?.vat_basis
      ? `<thread_preferences>\n${JSON.stringify(opts.threadPreferences)}\n</thread_preferences>`
      : "",
    opts.previousTurn
      ? `<previous_turn>\n${JSON.stringify(opts.previousTurn)}\n</previous_turn>`
      : "",
    `<today>${new Date().toISOString().slice(0, 10)}</today>`,
    `คำถามของผู้ใช้: ${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const chat = opts.chat ?? aiChat;
  const res = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    { provider: "gemini", jsonMode: true, temperature: 0, maxTokens: 600 },
  );

  if (!res) {
    return {
      metric_key: null,
      params: {},
      confidence: 0,
      needs_clarify: true,
      clarify_reason: "ระบบตีความคำถามไม่สำเร็จ กรุณาลองถามใหม่ให้เจาะจงขึ้น",
      usage: EMPTY_USAGE,
    };
  }

  const usage: BiIntentUsage = {
    tokenIn: res.inputTokens,
    tokenOut: res.outputTokens,
    model: res.model,
  };
  const raw = parseJsonObject(res.text);
  if (!raw) {
    return {
      metric_key: null,
      params: {},
      confidence: 0,
      needs_clarify: true,
      clarify_reason: "ระบบตีความคำถามไม่สำเร็จ กรุณาลองถามใหม่ให้เจาะจงขึ้น",
      usage,
    };
  }

  return sanitizeIntent(raw, candidates, usage, opts.threadPreferences ?? null);
}

/** JSON mode ยังหลุด markdown fence ได้บางครั้ง — แกะให้ทน */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = (text ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * ตัดทุกอย่างที่ไม่อยู่ใน allowlist ของ metric ที่ LLM เลือก
 * — ด่านนี้คือเหตุผลที่ prompt injection ทำอะไรไม่ได้ (§1.1)
 */
export function sanitizeIntent(
  raw: Record<string, unknown>,
  candidates: BiMetricCandidate[],
  usage: BiIntentUsage = EMPTY_USAGE,
  threadPreferences: { vat_basis?: VatBasis | null } | null = null,
): BiIntent {
  const keyRaw = typeof raw.metric_key === "string" ? raw.metric_key : null;
  const metric = candidates.find((c) => c.key === keyRaw) ?? null;

  const paramsRaw = (raw.params ?? {}) as Record<string, unknown>;
  const params: BiIntentParams = {};

  if (metric) {
    const period = sanitizePeriod(paramsRaw.period);
    if (period) params.period = period;

    const grain = paramsRaw.time_grain;
    if (isTimeGrain(grain) && metric.time_grains.includes(grain)) params.time_grain = grain;

    const dim = paramsRaw.dimension;
    if (typeof dim === "string" && metric.dimensions.some((d) => d.key === dim))
      params.dimension = dim;

    const cmp = paramsRaw.comparison;
    params.comparison =
      isComparison(cmp) && cmp !== "target" && metric.comparisons.includes(cmp)
        ? (cmp as Comparison)
        : "none";

    const filters = sanitizeFilters(paramsRaw.filters, metric);
    if (Object.keys(filters).length > 0) params.filters = filters;
  }

  const vatFromLlm = isVatBasis(paramsRaw.vat_basis) ? paramsRaw.vat_basis : null;
  params.vat_basis = vatFromLlm ?? threadPreferences?.vat_basis ?? null;

  const confidence = clamp01(Number(raw.confidence));
  const needsClarify = raw.needs_clarify === true || !metric || confidence < 0.5;

  return {
    metric_key: metric?.key ?? null,
    params,
    confidence,
    needs_clarify: needsClarify,
    clarify_reason:
      typeof raw.clarify_reason === "string" && raw.clarify_reason.trim()
        ? raw.clarify_reason.trim()
        : needsClarify
          ? "คำถามยังไม่ชัดพอที่จะตอบเป็นตัวเลขได้"
          : "",
    usage,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function sanitizePeriod(v: unknown): BiPeriodParam | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const grain: TimeGrain = isTimeGrain(o.grain) ? o.grain : "month";
  const from = isIsoDate(o.from) ? (o.from as string) : undefined;
  const to = isIsoDate(o.to) ? (o.to as string) : undefined;
  const offsetNum = Number(o.offset);
  const offset = Number.isFinite(offsetNum) ? Math.trunc(offsetNum) : 0;
  if (!from && !to && !isTimeGrain(o.grain)) return null;
  return { grain, offset, ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function isIsoDate(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** เก็บเฉพาะ filter key ที่ metric ประกาศไว้ + ชนิดค่าที่ตรง type */
export function sanitizeFilters(v: unknown, metric: BiMetricCandidate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;

  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    const def = metric.filters.find((f) => f.key === key);
    if (!def || value === null || value === undefined) continue;

    switch (def.type) {
      case "in_list":
      case "text_list":
        if (Array.isArray(value) && value.every((x) => typeof x === "string")) out[key] = value;
        else if (typeof value === "string" && value.trim()) out[key] = [value.trim()];
        break;
      case "boolean":
        if (typeof value === "boolean") out[key] = value;
        break;
      case "number_range":
      case "date_range": {
        if (typeof value !== "object" || Array.isArray(value)) break;
        const r = value as Record<string, unknown>;
        const range: Record<string, unknown> = {};
        if (r.min !== undefined && r.min !== null) range.min = r.min;
        if (r.max !== undefined && r.max !== null) range.max = r.max;
        if (Object.keys(range).length) out[key] = range;
        break;
      }
      case "text":
      default:
        if (typeof value === "string" && value.trim()) out[key] = value.trim();
        else if (Array.isArray(value) && value.every((x) => typeof x === "string"))
          out[key] = value;
        break;
    }
  }
  return out;
}

// ─── D1 — ฐานมูลค่า incl/excl VAT ──────────────────────────────────────────

const VAT_SUFFIX: Record<VatBasis, string> = {
  incl_vat: "_incl_vat",
  excl_vat: "_excl_vat",
};

/** คำที่บ่งบอกฐานมูลค่าชัดเจนในคำถาม (ไม่ต้องพึ่ง LLM) */
export function detectVatBasis(question: string): VatBasis | null {
  const q = question.toLowerCase();
  if (/(ก่อน\s*vat|ไม่รวม\s*vat|ก่อนภาษี|ไม่รวมภาษี|excl)/i.test(q)) return "excl_vat";
  if (/(รวม\s*vat|รวมภาษี|incl)/i.test(q)) return "incl_vat";
  return null;
}

/** true = metric ตัวนี้เป็นคู่ VAT (`…_incl_vat` / `…_excl_vat`) */
export function vatBasisOfKey(key: string): VatBasis | null {
  if (key.endsWith(VAT_SUFFIX.incl_vat)) return "incl_vat";
  if (key.endsWith(VAT_SUFFIX.excl_vat)) return "excl_vat";
  return null;
}

/** ฐานร่วมของคู่ VAT เช่น `gov_procure.pipeline_value_incl_vat` → `gov_procure.pipeline_value` */
export function vatBaseKey(key: string): string | null {
  const basis = vatBasisOfKey(key);
  return basis ? key.slice(0, -VAT_SUFFIX[basis].length) : null;
}

/** metric คู่ VAT ที่อยู่ในผลค้นหาชุดเดียวกัน (ใช้สร้างตัวเลือกตอนถามกลับ) */
export function vatSiblings(candidates: BiMetricCandidate[], key: string): BiMetricCandidate[] {
  const base = vatBaseKey(key);
  if (!base) return [];
  return candidates.filter((c) => vatBaseKey(c.key) === base);
}

/** สลับ metric ไปยังฐาน VAT ที่ผู้ใช้เลือก — คืน key เดิมถ้าไม่มีคู่ */
export function applyVatBasis(
  candidates: BiMetricCandidate[],
  key: string,
  basis: VatBasis | null | undefined,
): string {
  if (!basis) return key;
  const base = vatBaseKey(key);
  if (!base) return key;
  const target = `${base}${VAT_SUFFIX[basis]}`;
  return candidates.some((c) => c.key === target) ? target : key;
}
