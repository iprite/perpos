/**
 * catalog-ai.ts — AI enrich ของแคตตาล็อกสินค้า (gov_procure) — PRODUCTION
 *
 * มาตรฐานที่ยึด (docs/CLAUDE.md):
 *  §3 unified client  → เรียกผ่าน aiChat() เท่านั้น (ห้าม fetch provider ตรง)
 *  §5   prompt        → ไฟล์ versioned `lib/ai/prompts/gov-procure-catalog-item.vN.txt` + loadPrompt()
 *  §6   cost control  → ส่งเฉพาะ field ที่จำเป็น · maxTokens จาก catalog-cost.ts · log token ทุก call
 *  §8.3 adversarial   → ข้อความจากผู้ใช้ = "ข้อมูล" ไม่ใช่คำสั่ง (guard ทั้งใน prompt และ validator)
 *
 * pattern ของ module (lib/gov-procure/ai.ts:128-138) ที่ลอกมา:
 *  - ส่ง provider/model ทุก call (PERPOS_AI_PROVIDER ไม่ได้ตั้ง → default openai)
 *  - loadPrompt fail / aiChat null → fallback ทันที **ไม่ throw**
 *  - ไม่เชื่อค่าที่ AI คืนถ้าเป็นค่าที่ระบบตัดสินเอง (qty/unit/source/รูป/ฯลฯ)
 *
 * ⚠️ ไฟล์นี้ **ไม่แตะ** `lib/gov-procure/ai.ts` เดิม (brief/anomaly) — ADDITIVE
 */

import { aiChat, type AiProvider } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/load-prompt";
import { CHUNK_SIZE, MAX_TOKENS, estimateCost } from "@/lib/gov-procure/catalog-cost";

const PROMPT_NAME = "gov-procure-catalog-item";
const DEFAULT_PROVIDER: AiProvider = "gemini";
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_BUYER_TYPE = "หน่วยงานราชการ / อปท.";

/** เพดานความมั่นใจราคา — AI ไม่ได้ค้นเว็บ (spec §3.2) */
const PRICE_CONFIDENCE_CAP = 0.85;
/** ตัดความยาวก่อนส่งเข้าโมเดล (cost + กัน payload ระเบิด) */
const MAX_NAME_RAW = 200;
const MAX_TITLE = 120;
/** ตัดความยาวผลลัพธ์ */
const MAX_SPEC_LINE = 300;
const MAX_LINE = 200;
const MAX_BULLETS = 12;
const MIN_BULLETS = 5;
const MAX_LIST = 12;
const MAX_SUB_ITEMS = 30;
/** ราคาที่เกินนี้ถือว่าโมเดลเพี้ยน (บาท/หน่วย) */
const MAX_PRICE = 100_000_000;

const WARN_LOW_BULLETS = "AI ให้รายละเอียดน้อยกว่าปกติ — โปรดเพิ่มรายละเอียดสินค้าก่อนออกเอกสาร";
const WARN_BAD_PRICE = "ราคาที่ AI ให้ไม่สมเหตุผล ระบบล้างทิ้ง — ต้องกรอกจากใบเสนอราคาจริง";
const WARN_NO_BASIS = "AI ให้ราคาโดยไม่ระบุที่มา ระบบล้างทิ้ง — ต้องกรอกจากใบเสนอราคาจริง";
const WARN_BAD_CONF =
  "AI ให้ค่าความเชื่อมั่นไม่ถูกต้อง ระบบตั้งเป็น 0.5 — โปรดตรวจเนื้อหาทั้งรายการ";

// ─── Public types ────────────────────────────────────────────────────────────

export interface CatalogEnrichContext {
  catalog_title: string;
  /** คงที่ "หน่วยงานราชการ / อปท." */
  buyer_type?: string;
  /** 1 ใน COMPANIES — ใช้เป็นบริบทโทนเอกสารเท่านั้น */
  company?: string;
  template: "table" | "narrative";
}

export interface CatalogEnrichItemInput {
  /** `it-<uuid 8 ตัวแรก>` — binding กันสลับรายการ */
  ref: string;
  name_raw: string;
  qty: number | null;
  unit: string | null;
}

export interface CatalogSubItem {
  name: string;
  qty: number | null;
  unit: string | null;
}

/**
 * ฟิลด์ที่พร้อมเขียนลง `gov_procure_catalog_items` — **allowlist** (contract §5.3)
 * ฟิลด์ server-set **ไม่มีที่นี่โดยเจตนา** ได้แก่ image_path, qty, unit, source,
 * verified_by, verified_at, org_id, catalog_id, product_id, enrich_state,
 * enrich_claimed_at, enrich_job_id, price_updated_by, price_updated_at,
 * price_history, viewed_at
 * (เลี่ยงเขียนแบบ wildcard ในคอมเมนต์ — ลำดับดอกจันตามด้วยสแลชจะปิดบล็อกคอมเมนต์กลางคัน)
 */
export interface CatalogEnrichFields {
  name: string;
  brand_model: string | null;
  spec_line: string | null;
  size_line: string | null;
  bullets: string[];
  care_notes: string[];
  caution_notes: string[];
  ai_warnings: string[];
  ai_note: string | null;
  sub_items: CatalogSubItem[];
  category: string | null;
  unit_price_ref: number | null;
  price_min: number | null;
  price_max: number | null;
  price_basis: string | null;
  price_confidence: number | null;
  confidence: number | null;
}

export interface CatalogEnrichResult {
  ok: true;
  ref: string;
  fields: CatalogEnrichFields;
}

export interface CatalogEnrichFailure {
  ok: false;
  ref: string;
  reason: string;
}

export interface CatalogEnrichMeta {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** true = AI ไม่พร้อม/ตอบไม่ได้ทั้ง chunk (ทุก item อยู่ใน failed) */
  fallback: boolean;
  /** ต้นทุนโดยประมาณของ call นี้ (บาท) — สูตรจาก catalog-cost.ts */
  estCostThb: number;
}

export interface CatalogEnrichOutcome {
  results: CatalogEnrichResult[];
  failed: CatalogEnrichFailure[];
  /** ref ที่ AI ไม่คืน/คืนไม่ผ่าน validate (= failed.map(f => f.ref)) */
  failedRefs: string[];
  meta: CatalogEnrichMeta;
}

export interface CatalogEnrichOptions {
  /** override provider (ใช้ตอน fallback ไป openai) */
  provider?: AiProvider;
  model?: string;
  /** จำนวนครั้งที่ยิงซ้ำเมื่อ aiChat คืน null (default 1) */
  retries?: number;
  /** หน่วงก่อน retry (default 1500ms) */
  retryDelayMs?: number;
}

// ─── sanitize helpers (ไม่เชื่อค่าดิบจาก AI) ───────────────────────────────────

/** อักขระควบคุมทั้งหมด (รวม newline/tab) — strip กัน output พังตอนลง PDF/HTML */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]+", "g");

/** strip control chars + ยุบช่องว่าง + trim + ตัดความยาว */
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max).trim() : s;
}

/** list ของ string ที่ผ่าน cleanText — ตัดค่าว่าง, จำกัดจำนวน */
function cleanList(v: unknown, maxItems: number, maxLen = MAX_LINE): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    const s = cleanText(raw, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** number ที่ finite เท่านั้น (รับ numeric string ด้วย) — ไม่งั้น null */
function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function cleanSubItems(v: unknown): CatalogSubItem[] {
  if (!Array.isArray(v)) return [];
  const out: CatalogSubItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = cleanText(r.name, MAX_LINE);
    if (!name) continue;
    const qty = toNum(r.qty);
    out.push({
      name,
      qty: qty !== null && qty >= 0 && qty < 1_000_000 ? qty : null,
      unit: cleanText(r.unit, 40),
    });
    if (out.length >= MAX_SUB_ITEMS) break;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── validator (หัวใจ — ห้ามเชื่อ AI ดิบ ๆ · spec §2.2) ────────────────────────

/**
 * แปลง 1 รายการที่ AI คืน → ฟิลด์ DB ตาม field mapping (contract §5.3)
 *
 * กฎที่บังคับที่นี่ (ไม่ใช่ที่ prompt — prompt เชื่อไม่ได้):
 *  - **allowlist**: ผลลัพธ์สร้างจากคีย์ที่เรากำหนดเองล้วน → ฟิลด์ server-set ที่ AI แอบคืนมา
 *    (`image_path`/`qty`/`unit`/`source`/`verified_*`/`org_id`/`catalog_id`/`product_id`/
 *     `enrich_*`/`price_updated_*`/`price_history`/`viewed_at`) **ถูกทิ้งเสมอ**
 *  - ราคาไม่สมเหตุผล / ไม่มี `price_basis` → ล้างราคาทั้งชุด
 *  - `price_confidence` เพดาน 0.85 · `content_confidence` นอก 0–1 → 0.5
 */
export function validateEnrichedItem(
  raw: unknown,
  input: CatalogEnrichItemInput,
): CatalogEnrichFields | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const warnings = cleanList(r.ai_warnings, MAX_LIST, 300);
  const warn = (msg: string) => {
    if (!warnings.includes(msg)) warnings.push(msg);
  };

  // ชื่อ: ถ้า AI ไม่คืน/คืนขยะ → ใช้ชื่อดิบของผู้ใช้ (ดีกว่าทิ้งทั้งรายการ)
  const name = cleanText(r.product_name_clean, MAX_LINE) ?? cleanText(input.name_raw, MAX_LINE);
  if (!name) return null;

  const brand = cleanText(r.brand, 80);
  const modelCode = cleanText(r.model_code, 80);
  const brandModel = [brand, modelCode].filter(Boolean).join(" ") || null;

  const specLine = cleanText(r.spec_line, MAX_SPEC_LINE);
  const sizeLines = cleanList(r.size_packing, 3);
  const sizeLine = sizeLines.length > 0 ? sizeLines.join("\n") : null;

  const bullets = cleanList(r.bullets, MAX_BULLETS);
  if (bullets.length > 0 && bullets.length < MIN_BULLETS) warn(WARN_LOW_BULLETS);

  // content_confidence → คอลัมน์ `confidence`
  const rawConf = toNum(r.content_confidence);
  let confidence: number;
  if (rawConf === null || rawConf < 0 || rawConf > 1) {
    confidence = 0.5;
    warn(WARN_BAD_CONF);
  } else {
    confidence = rawConf;
  }

  // ── ราคา ──────────────────────────────────────────────────────────────────
  let priceRef = toNum(r.unit_price_ref);
  let priceMin = toNum(r.price_min);
  let priceMax = toNum(r.price_max);
  const priceBasis = cleanText(r.price_basis, 300);
  const sane = (n: number | null) => n === null || (n >= 0 && n <= MAX_PRICE);

  let badPrice = !sane(priceRef) || !sane(priceMin) || !sane(priceMax);
  if (!badPrice && priceMin !== null && priceMax !== null && priceMin > priceMax) badPrice = true;
  if (!badPrice && priceRef !== null) {
    if (priceMin !== null && priceRef < priceMin) badPrice = true;
    if (priceMax !== null && priceRef > priceMax) badPrice = true;
  }
  if (badPrice) {
    priceRef = priceMin = priceMax = null;
    warn(WARN_BAD_PRICE);
  }
  // Q2a — ราคาต้องมีที่มาเสมอ ไม่มี = ใช้ไม่ได้
  const hasPrice = priceRef !== null || priceMin !== null || priceMax !== null;
  if (hasPrice && !priceBasis) {
    priceRef = priceMin = priceMax = null;
    warn(WARN_NO_BASIS);
  }

  const stillHasPrice = priceRef !== null || priceMin !== null || priceMax !== null;
  const rawPriceConf = toNum(r.price_confidence);
  const priceConfidence = !stillHasPrice
    ? 0
    : rawPriceConf === null
      ? 0
      : Math.min(clamp01(rawPriceConf), PRICE_CONFIDENCE_CAP);

  return {
    name,
    brand_model: brandModel,
    spec_line: specLine,
    size_line: sizeLine,
    bullets,
    care_notes: cleanList(r.care_notes, MAX_LIST),
    caution_notes: cleanList(r.caution_notes, MAX_LIST),
    ai_warnings: warnings,
    ai_note: warnings[0] ?? null,
    sub_items: cleanSubItems(r.sub_items),
    category: cleanText(r.category, 60),
    unit_price_ref: priceRef,
    price_min: priceMin,
    price_max: priceMax,
    price_basis: priceBasis,
    price_confidence: priceConfidence,
    confidence,
  };
}

/** ดึง array `items` ออกจากข้อความที่โมเดลคืน (tolerant: code fence / ข้อความหุ้ม) */
export function parseItemsPayload(text: string): unknown[] | null {
  if (!text) return null;
  const stripped = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const candidates = [stripped];
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(stripped.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        const items = (parsed as Record<string, unknown>).items;
        if (Array.isArray(items)) return items;
      }
    } catch {
      // ลองตัวถัดไป
    }
  }
  return null;
}

// ─── entry point ─────────────────────────────────────────────────────────────

function emptyMeta(model: string, provider: string): CatalogEnrichMeta {
  return {
    model,
    provider,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    fallback: true,
    estCostThb: 0,
  };
}

function allFailed(
  items: CatalogEnrichItemInput[],
  reason: string,
  meta: CatalogEnrichMeta,
): CatalogEnrichOutcome {
  const failed: CatalogEnrichFailure[] = items.map((it) => ({ ok: false, ref: it.ref, reason }));
  return { results: [], failed, failedRefs: failed.map((f) => f.ref), meta };
}

/**
 * enrichCatalogChunk — เติมรายละเอียดสินค้า 1 ก้อน (≤ CHUNK_SIZE รายการ) ด้วย AI
 *
 * **ไม่ throw ทุกกรณี** — AI ไม่พร้อม/ตอบพัง = ทุก item อยู่ใน `failed` (route ตั้ง enrich_state='failed'
 * แล้วผู้ใช้กรอกเองต่อได้) ตามกฎ fallback ของ module (`lib/gov-procure/ai.ts`)
 *
 * รับได้ทั้ง `(ctx, items)` และ `(items, ctx)` — สเปกสองฉบับเขียนสลับลำดับกันไว้
 * (`.ai.md §2` = (ctx, items) · `build.md` = (items, ctx)) จึงรองรับทั้งคู่เพื่อไม่ให้ integration พัง
 */
export async function enrichCatalogChunk(
  ctx: CatalogEnrichContext,
  items: CatalogEnrichItemInput[],
  opts?: CatalogEnrichOptions,
): Promise<CatalogEnrichOutcome>;
export async function enrichCatalogChunk(
  items: CatalogEnrichItemInput[],
  ctx: CatalogEnrichContext,
  opts?: CatalogEnrichOptions,
): Promise<CatalogEnrichOutcome>;
export async function enrichCatalogChunk(
  a: CatalogEnrichContext | CatalogEnrichItemInput[],
  b: CatalogEnrichItemInput[] | CatalogEnrichContext,
  opts: CatalogEnrichOptions = {},
): Promise<CatalogEnrichOutcome> {
  const ctx = (Array.isArray(a) ? b : a) as CatalogEnrichContext;
  const rawItems = (Array.isArray(a) ? a : b) as CatalogEnrichItemInput[];

  const provider = opts.provider ?? DEFAULT_PROVIDER;
  const model = opts.model ?? (provider === DEFAULT_PROVIDER ? DEFAULT_MODEL : undefined);
  const modelLabel = model ?? provider;

  const all = Array.isArray(rawItems) ? rawItems.filter((it) => it && it.ref) : [];
  const items = all.slice(0, CHUNK_SIZE);
  const overflow = all.slice(CHUNK_SIZE);

  if (items.length === 0) {
    return {
      results: [],
      failed: [],
      failedRefs: [],
      meta: { ...emptyMeta(modelLabel, provider), fallback: false },
    };
  }

  let systemPrompt: string;
  try {
    systemPrompt = await loadPrompt(PROMPT_NAME);
  } catch {
    console.warn("[gov-procure:ai-catalog] prompt load failed — fallback ทั้งก้อน");
    return allFailed(all, "ai_unavailable: โหลด prompt ไม่ได้", emptyMeta(modelLabel, provider));
  }

  // ส่งเฉพาะที่จำเป็น (cost + กัน anchor ราคา + กันข้อมูลรั่ว) — ไม่ส่งราคา/notes/order ใด ๆ
  const userPayload = {
    context: {
      buyer_type: ctx.buyer_type ?? DEFAULT_BUYER_TYPE,
      catalog_title: cleanText(ctx.catalog_title, MAX_TITLE) ?? "",
      template: ctx.template === "narrative" ? "narrative" : "table",
      ...(ctx.company ? { company: cleanText(ctx.company, 80) ?? "" } : {}),
    },
    items: items.map((it) => ({
      ref: it.ref,
      name_raw: cleanText(it.name_raw, MAX_NAME_RAW) ?? "",
      qty: typeof it.qty === "number" && Number.isFinite(it.qty) ? it.qty : null,
      unit: cleanText(it.unit, 40),
    })),
  };

  const retries = opts.retries ?? 1;
  const retryDelayMs = opts.retryDelayMs ?? 1500;

  let ai = null as Awaited<ReturnType<typeof aiChat>>;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && retryDelayMs > 0) await sleep(retryDelayMs);
    ai = await aiChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      { provider, model, jsonMode: true, temperature: 0, maxTokens: MAX_TOKENS },
    );
    if (ai) break;
  }

  if (!ai) {
    return allFailed(all, "ai_unavailable: ผู้ช่วย AI ไม่ตอบสนอง", emptyMeta(modelLabel, provider));
  }

  const meta: CatalogEnrichMeta = {
    model: ai.model,
    provider: ai.provider,
    inputTokens: ai.inputTokens,
    outputTokens: ai.outputTokens,
    latencyMs: ai.latencyMs,
    fallback: false,
    estCostThb: estimateCost(ai.inputTokens, ai.outputTokens).thb,
  };

  // log token usage ทุก call (docs/CLAUDE.md §6.3-5)
  console.info(
    `[gov-procure:ai-catalog] model=${ai.model} provider=${ai.provider} items=${items.length} in=${ai.inputTokens} out=${ai.outputTokens} latency=${ai.latencyMs}ms`,
  );

  const parsed = parseItemsPayload(ai.text);
  if (!parsed) {
    return allFailed(all, "parse_failed: ผลลัพธ์ AI ไม่ใช่ JSON ที่อ่านได้", {
      ...meta,
      fallback: true,
    });
  }

  // map กลับด้วย ref เท่านั้น — ห้ามเดา index (เขียนสเปกผิดรายการ = เอกสารผิด)
  const byRef = new Map<string, unknown>();
  for (const el of parsed) {
    if (!el || typeof el !== "object" || Array.isArray(el)) continue;
    const ref = cleanText((el as Record<string, unknown>).ref, 64);
    if (!ref) continue;
    if (!items.some((it) => it.ref === ref)) continue; // ref ที่ไม่ได้ส่งไป = ทิ้ง
    if (byRef.has(ref)) continue; // ซ้ำ = เอาตัวแรก
    byRef.set(ref, el);
  }

  const results: CatalogEnrichResult[] = [];
  const failed: CatalogEnrichFailure[] = [];
  for (const it of items) {
    const el = byRef.get(it.ref);
    if (el === undefined) {
      failed.push({ ok: false, ref: it.ref, reason: "AI ไม่คืนผลของรายการนี้" });
      continue;
    }
    const fields = validateEnrichedItem(el, it);
    if (!fields) {
      failed.push({ ok: false, ref: it.ref, reason: "ผลลัพธ์ของรายการนี้ไม่ผ่านการตรวจสอบ" });
      continue;
    }
    results.push({ ok: true, ref: it.ref, fields });
  }
  for (const it of overflow) {
    failed.push({ ok: false, ref: it.ref, reason: `เกินขนาดก้อนที่อนุญาต (${CHUNK_SIZE})` });
  }

  return {
    results,
    failed,
    failedRefs: failed.map((f) => f.ref),
    meta: { ...meta, fallback: results.length === 0 },
  };
}
