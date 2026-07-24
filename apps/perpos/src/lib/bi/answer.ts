/**
 * lib/bi/answer.ts — สเต็ป "เรียบเรียงคำตอบ" (contract §2 ข้อ 5 · §3.3)
 *
 * กฎเหล็กสองข้อที่บังคับด้วยโค้ด ไม่ใช่แค่ prompt:
 *  1. **ห้าม LLM ผลิตตัวเลขที่ไม่ได้อยู่ใน result set** — ทุก bullet ถูกตรวจด้วย
 *     `verifyBulletNumbers()` ตรวจไม่ผ่าน = ทิ้งคำตอบของ LLM แล้วใช้ bullet ที่ระบบ
 *     ประกอบเองจากตัวเลขจริง (deterministic fallback)
 *  2. **data boundary (§5)** — `no_summarize=true` หรือ grain เป็นรายการ (detail)
 *     → **ไม่เรียก LLM เลย** (ข้อมูลระดับรายการห้ามเข้าโมเดล)
 *
 * prompt: `lib/ai/prompts/bi-answer.v1.txt` (versioned ตาม CONTEXT §12)
 */

import { aiChat } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/load-prompt";
import { formatDeltaPercent, formatMetricValue, MINUS } from "./format";
import { formatPeriodRange, periodLine, type BiPeriod } from "./period";
import { DIMENSION_KEY, measureKeys, VALUE_KEY, type RunMetricMeta } from "./runner";
import type { BiMetricCandidate } from "./resolver";
import type { MetricUnit } from "./types";

export const BI_ANSWER_PROMPT = "bi-answer";
export const BI_ANSWER_PROMPT_VERSION = "v1";

/** แถวสูงสุดที่ยอมส่งเข้า LLM (คุมต้นทุน — ผลที่ยาวกว่านี้อ่านจากตารางแทน) */
export const MAX_ROWS_TO_LLM = 40;

export interface NarrateUsage {
  tokenIn: number;
  tokenOut: number;
  model: string;
}

export interface NarrateResult {
  bullets: string[];
  follow_ups: string[];
  usage: NarrateUsage;
  /** `llm` = Gemini เรียบเรียง · `rule` = ระบบประกอบเอง (ไม่เรียก AI หรือ guard ตีตก) */
  source: "llm" | "rule";
  /** เหตุผลที่ไม่ได้ใช้คำตอบของ LLM (debug/audit) */
  fallback_reason?: string;
}

export interface NarrateInput {
  question: string;
  metric: RunMetricMeta;
  /** metadata ของ metric จาก retrieval (ใช้เสนอคำถามต่อยอดตามมิติที่มีจริง) */
  candidate?: Pick<BiMetricCandidate, "dimensions" | "label_th"> | null;
  rows: Array<Record<string, unknown>>;
  period: BiPeriod | null;
  comparePeriod?: BiPeriod | null;
  /** ผลของช่วงเปรียบเทียบ (ถ้ามี) — ใช้คิด delta แบบ deterministic */
  compareRows?: Array<Record<string, unknown>> | null;
  /** true = grain เป็นรายการ (drill-down) → ห้ามเข้า LLM */
  isDetailGrain?: boolean;
  truncated?: boolean;
  notices?: string[];
  /** ทดสอบ: แทนที่ตัวเรียก LLM */
  chat?: typeof aiChat;
}

const EMPTY_USAGE: NarrateUsage = { tokenIn: 0, tokenOut: 0, model: "" };

/** เรียบเรียงคำตอบ — คืน bullet 2–4 ข้อ + คำถามต่อยอด 2–3 ข้อ (§3.3) */
export async function narrateAnswer(input: NarrateInput): Promise<NarrateResult> {
  const ruleBullets = buildDeterministicBullets(input);
  const ruleFollowUps = buildFollowUps(input.candidate ?? null);

  // ─ data boundary (§5): ข้อมูลระดับรายการ / metric ที่ติดธง ห้ามเข้า LLM ─
  if (input.metric.no_summarize || input.isDetailGrain) {
    return {
      bullets: ruleBullets,
      follow_ups: ruleFollowUps,
      usage: EMPTY_USAGE,
      source: "rule",
      fallback_reason: "data boundary: ผลระดับรายการ/metric ติดธง no_summarize",
    };
  }
  // ผลว่าง → ไม่ต้องเปลือง LLM
  if (input.rows.length === 0) {
    return {
      bullets: ruleBullets,
      follow_ups: ruleFollowUps,
      usage: EMPTY_USAGE,
      source: "rule",
      fallback_reason: "ไม่มีข้อมูลในช่วงที่เลือก",
    };
  }

  let system: string;
  try {
    system = await loadPrompt(BI_ANSWER_PROMPT, BI_ANSWER_PROMPT_VERSION);
  } catch {
    return {
      bullets: ruleBullets,
      follow_ups: ruleFollowUps,
      usage: EMPTY_USAGE,
      source: "rule",
      fallback_reason: "โหลด prompt ไม่สำเร็จ",
    };
  }

  const rowsForLlm = input.rows.slice(0, MAX_ROWS_TO_LLM);
  const userContent = [
    `<metric>${JSON.stringify({
      ชื่อ: input.metric.label_th,
      นิยาม: input.metric.definition_th,
      หน่วย: input.metric.unit,
      นับรวม: input.metric.includes,
      ไม่นับ: input.metric.excludes,
    })}</metric>`,
    `<period>${input.period ? `${input.period.label_th} (${formatPeriodRange(input.period.from, input.period.to)})` : "ภาพ ณ ปัจจุบัน (ไม่อิงช่วงเวลา)"}</period>`,
    `<dimensions>${JSON.stringify((input.candidate?.dimensions ?? []).map((d) => d.label_th))}</dimensions>`,
    `<result>${JSON.stringify(rowsForLlm)}</result>`,
    input.truncated ? "<note>ผลลัพธ์ถูกตัดจำนวนแถว — ห้ามสรุปยอดรวมจากชุดนี้</note>" : "",
    `คำถามของผู้ใช้: ${input.question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const chat = input.chat ?? aiChat;
  const res = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    { provider: "gemini", jsonMode: true, temperature: 0.2, maxTokens: 700 },
  );

  if (!res) {
    return {
      bullets: ruleBullets,
      follow_ups: ruleFollowUps,
      usage: EMPTY_USAGE,
      source: "rule",
      fallback_reason: "เรียก AI ไม่สำเร็จ",
    };
  }

  const usage: NarrateUsage = {
    tokenIn: res.inputTokens,
    tokenOut: res.outputTokens,
    model: res.model,
  };
  const parsed = parseNarration(res.text);
  if (!parsed || parsed.bullets.length === 0) {
    return {
      bullets: ruleBullets,
      follow_ups: ruleFollowUps,
      usage,
      source: "rule",
      fallback_reason: "รูปแบบคำตอบของ AI ไม่ถูกต้อง",
    };
  }

  // ─ guard: ตัวเลขทุกตัวใน bullet ต้องมาจาก result set ─
  const check = verifyBulletNumbers(parsed.bullets, input.rows, allowedContextText(input));
  if (!check.ok) {
    return {
      bullets: ruleBullets,
      follow_ups: parsed.follow_ups.length ? parsed.follow_ups.slice(0, 3) : ruleFollowUps,
      usage,
      source: "rule",
      fallback_reason: `พบตัวเลขที่ไม่ได้มาจากผลลัพธ์: ${check.offending.join(", ")}`,
    };
  }

  return {
    bullets: parsed.bullets.slice(0, 4),
    follow_ups: (parsed.follow_ups.length ? parsed.follow_ups : ruleFollowUps).slice(0, 3),
    usage,
    source: "llm",
  };
}

function parseNarration(text: string): { bullets: string[]; follow_ups: string[] } | null {
  const cleaned = (text ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const bullets = Array.isArray(o.bullets)
      ? o.bullets
          .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
          .map((b) => b.trim())
      : [];
    const follow = Array.isArray(o.follow_ups)
      ? o.follow_ups
          .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
          .map((b) => b.trim())
      : [];
    return { bullets, follow_ups: follow };
  } catch {
    return null;
  }
}

/** ข้อความที่ "ตัวเลขในนั้นถือว่าปลอดภัย" (ปี พ.ศ./วันที่ของช่วงเวลา, ชื่อกลุ่ม) */
function allowedContextText(input: NarrateInput): string {
  return [
    input.period?.label_th ?? "",
    input.period ? formatPeriodRange(input.period.from, input.period.to) : "",
    input.comparePeriod?.label_th ?? "",
    input.metric.label_th,
    input.metric.definition_th,
    ...input.rows.map((r) => String(r[DIMENSION_KEY] ?? "")),
  ].join(" ");
}

// ─── guard: ตัวเลขต้องมาจาก result set ─────────────────────────────────────

/** ค่าที่ยอมรับได้ = ค่าในทุกเซลล์ + ผลรวมต่อคอลัมน์ + จำนวนแถว + สัดส่วน/ส่วนต่างที่คำนวณจากชุดนี้ */
export function collectAllowedNumbers(rows: Array<Record<string, unknown>>): number[] {
  const allowed = new Set<number>();
  const add = (n: number) => {
    if (Number.isFinite(n)) {
      allowed.add(round(n, 2));
      allowed.add(round(n, 1));
      allowed.add(Math.round(n));
    }
  };

  add(rows.length);
  const keys = measureKeys(rows);
  for (const key of keys) {
    let sum = 0;
    for (const row of rows) {
      const n = Number(row[key]);
      if (!Number.isFinite(n)) continue;
      add(n);
      add(Math.abs(n));
      sum += n;
    }
    add(sum);
    // สัดส่วนของแต่ละกลุ่มต่อยอดรวม (เป็น %) — ตัวเลขที่ผู้เรียบเรียงมักอ้าง
    if (sum !== 0) {
      for (const row of rows) {
        const n = Number(row[key]);
        if (Number.isFinite(n)) add((n / sum) * 100);
      }
    }
    // ส่วนต่าง/อัตราเปลี่ยนแปลงระหว่างแถวแรกกับแถวอื่น (เทียบช่วง/เทียบกลุ่ม)
    const values = rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n));
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < values.length; j++) {
        if (i === j) continue;
        add(values[i] - values[j]);
        if (values[j] !== 0) add(((values[i] - values[j]) / Math.abs(values[j])) * 100);
      }
    }
  }
  return Array.from(allowed);
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** ดึงตัวเลขทั้งหมดจากข้อความ (รองรับคั่นหลักพัน + เครื่องหมายลบ U+2212) */
export function extractNumbers(text: string): number[] {
  const normalized = (text ?? "").replace(new RegExp(MINUS, "g"), "-");
  const matches = normalized.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((m) => Number(m.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

function matchesAllowed(value: number, allowed: number[]): boolean {
  const tolerance = Math.max(0.01, Math.abs(value) * 0.005);
  return allowed.some((a) => Math.abs(a - value) <= tolerance);
}

/**
 * ตรวจว่าทุกตัวเลขใน bullet มาจาก result set (หรือจากข้อความบริบทที่อนุญาต เช่น ปี พ.ศ.)
 * ไม่ผ่าน = ทิ้งคำตอบของ LLM ทั้งชุด
 */
export function verifyBulletNumbers(
  bullets: string[],
  rows: Array<Record<string, unknown>>,
  contextText = "",
): { ok: boolean; offending: number[] } {
  const allowed = [...collectAllowedNumbers(rows), ...extractNumbers(contextText)];
  const offending: number[] = [];

  for (const bullet of bullets) {
    for (const n of extractNumbers(bullet)) {
      if (!matchesAllowed(n, allowed)) offending.push(n);
    }
  }
  return { ok: offending.length === 0, offending: Array.from(new Set(offending)) };
}

// ─── deterministic fallback ────────────────────────────────────────────────

/** bullet ที่ระบบประกอบเองจากตัวเลขจริง — ใช้เมื่อห้ามเรียก LLM หรือ guard ตีตก */
export function buildDeterministicBullets(input: NarrateInput): string[] {
  const { rows, metric } = input;
  const unit = metric.unit;
  const decimals = metric.unit_decimals;
  const bullets: string[] = [];

  if (rows.length === 0) {
    bullets.push(`ช่วงที่เลือกยังไม่มีข้อมูลของ${metric.label_th}`);
    if (input.period) bullets.push(periodLine(input.period));
    return bullets;
  }

  const hasDim = rows.some((r) => r[DIMENSION_KEY] !== undefined && r[DIMENSION_KEY] !== null);
  const valueKey = measureKeys(rows).includes(VALUE_KEY)
    ? VALUE_KEY
    : (measureKeys(rows)[0] ?? VALUE_KEY);

  if (!hasDim || rows.length === 1) {
    const v = Number(rows[0]?.[valueKey]);
    bullets.push(`${metric.label_th}: ${fmt(v, unit, decimals)}`);
  } else {
    const total = rows.reduce((s, r) => s + (Number(r[valueKey]) || 0), 0);
    bullets.push(
      `${metric.label_th}รวมทั้งหมด ${fmt(total, unit, decimals)} จาก ${rows.length} กลุ่ม`,
    );

    const sorted = [...rows].sort(
      (a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0),
    );
    const top = sorted[0];
    if (top) {
      const share =
        total !== 0
          ? ` (คิดเป็น ${fmt((Number(top[valueKey]) / total) * 100, "percent", 1)} ของทั้งหมด)`
          : "";
      bullets.push(
        `กลุ่มที่สูงสุดคือ ${String(top[DIMENSION_KEY] ?? "-")} ที่ ${fmt(Number(top[valueKey]), unit, decimals)}${share}`,
      );
    }
  }

  // เทียบช่วงก่อนหน้า (คำนวณเอง ไม่ให้ LLM คิด)
  if (input.compareRows && input.compareRows.length > 0) {
    const cur = rows.reduce((s, r) => s + (Number(r[valueKey]) || 0), 0);
    const prev = input.compareRows.reduce((s, r) => s + (Number(r[valueKey]) || 0), 0);
    const delta = formatDeltaPercent(cur, prev);
    if (delta) {
      bullets.push(
        `เทียบกับ${input.comparePeriod?.label_th ?? "ช่วงก่อนหน้า"} ${delta} (จาก ${fmt(prev, unit, decimals)})`,
      );
    }
  }

  if (input.truncated) {
    bullets.push("ผลลัพธ์ถูกตัดจำนวนแถวตามเพดานของระบบ — ยอดรวมด้านบนอาจไม่ครบทุกแถว");
  }
  for (const notice of input.notices ?? []) bullets.push(notice);

  return bullets.slice(0, 4);
}

function fmt(v: number, unit: MetricUnit, decimals: number): string {
  return formatMetricValue(v, unit, { decimals });
}

/** คำถามต่อยอดที่ระบบตอบได้จริง (สร้างจากมิติที่ metric ประกาศไว้) */
export function buildFollowUps(
  candidate: Pick<BiMetricCandidate, "dimensions" | "label_th"> | null,
): string[] {
  const dims = candidate?.dimensions ?? [];
  const out = dims
    .slice(0, 2)
    .map((d) => `ขอดู${candidate?.label_th ?? "ตัวเลขนี้"}แยกตาม${d.label_th}`);
  out.push("เทียบกับช่วงก่อนหน้าให้หน่อย");
  return out.slice(0, 3);
}

// ─── บรรทัดนิยาม (§3.1 ข้อ 5 — ต้องแนบทุกคำตอบ) ────────────────────────────

/** "นิยาม: … · ช่วงเวลา: …" — ผู้บริหารต้องเห็นเสมอว่าเลขนี้นับอะไร */
export function buildDefinitionLine(
  metric: Pick<RunMetricMeta, "label_th" | "definition_th">,
  period: BiPeriod | null,
  comparePeriod?: BiPeriod | null,
): string {
  const def = `นิยาม: ${metric.label_th} — ${metric.definition_th}`;
  const time = period
    ? periodLine(period, comparePeriod ?? null)
    : "ช่วงเวลา: ภาพ ณ ปัจจุบัน (ไม่อิงช่วงเวลา)";
  return `${def} · ${time}`;
}
