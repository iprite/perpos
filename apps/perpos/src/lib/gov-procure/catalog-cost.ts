/**
 * lib/gov-procure/catalog-cost.ts — เจ้าภาพเดียวของ "เรตโมเดล + สูตร token→บาท + เพดานคุมค่าใช้จ่าย"
 * ของฟีเจอร์แคตตาล็อกสินค้า AI (contract §5.9 C-9 / C6 / A-8 · ลอกโครงจาก lib/assistant/stt-cost.ts)
 *
 * ที่มาเรต (ณ ออกแบบ · `.ai.md §4.3`): gemini-2.5-flash = $0.30/1M input · $2.50/1M output · USD→THB 36
 *   → ชุด 84 รายการ (11 call × 8 รายการ) ≈ $0.113 ≈ **฿4.1 ต่อชุด**
 * ราคาเปลี่ยนได้ → override ผ่าน env โดยไม่ต้องแก้โค้ด
 */

// ---------------------------------------------------------------------------
// เพดานคุมค่าใช้จ่าย (A-8) — route `/enrich` ต้องเช็คครบทั้ง 3 ข้อก่อนสร้าง job
// ---------------------------------------------------------------------------

/** รายการสูงสุดต่อ 1 job (เกิน → 400) — ตรงกับ CHECK `total_items <= 300` ใน DB */
export const MAX_ITEMS_PER_JOB = 300;

/** job ที่ยัง active (`pending`/`processing`) ต่อ org (ถึงเพดาน → 429) */
export const MAX_ACTIVE_JOBS_PER_ORG = 2;

/** งบ token รวม (input+output) ต่อวันต่อ org (เกิน → 429) */
export const DAILY_TOKEN_BUDGET = 1_500_000;

/** จำนวนรายการต่อ 1 call ของ AI — **ห้ามรับจาก body** (A-12) */
export const CHUNK_SIZE = 8;

/** maxTokens ที่ต้องส่งทุก call (default 800 ของ client จะตัด output กลาง chunk = บั๊กเงียบ) */
export const MAX_TOKENS = 8000;

/** โมเดลที่ฟีเจอร์นี้ใช้ (ส่ง provider/model เองทุก call — ห้ามพึ่ง env default) */
export const CATALOG_AI_MODEL = "gemini-2.5-flash";
export const CATALOG_AI_PROVIDER = "gemini";

// ---------------------------------------------------------------------------
// เรตราคา
// ---------------------------------------------------------------------------

export interface CatalogPricing {
  /** ราคา input token ($ ต่อ 1,000,000 tokens) */
  inputUsdPerMTok: number;
  /** ราคา output token ($ ต่อ 1,000,000 tokens) — รวม thinking */
  outputUsdPerMTok: number;
  /** อัตราแลกเปลี่ยน USD → THB สำหรับแสดงผล */
  usdThbRate: number;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function getCatalogPricing(): CatalogPricing {
  return {
    inputUsdPerMTok: num("GOV_PROCURE_AI_INPUT_USD_PER_M", 0.3),
    outputUsdPerMTok: num("GOV_PROCURE_AI_OUTPUT_USD_PER_M", 2.5),
    usdThbRate: num("GOV_PROCURE_AI_USD_THB_RATE", 36),
  };
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  thb: number;
}

/** ต้นทุนจากจำนวน token จริงที่โมเดลรายงาน (ค่าติดลบ/NaN ถูกปัดเป็น 0) */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: CatalogPricing = getCatalogPricing(),
): CostEstimate {
  const inTok = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const outTok = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const usd =
    (inTok / 1_000_000) * pricing.inputUsdPerMTok + (outTok / 1_000_000) * pricing.outputUsdPerMTok;
  return {
    inputTokens: inTok,
    outputTokens: outTok,
    usd,
    thb: usd * pricing.usdThbRate,
  };
}

/** จำนวน call ของ AI ที่ต้องใช้กับ n รายการ (chunk ละ `CHUNK_SIZE`) */
export function chunkCount(itemCount: number, chunkSize: number = CHUNK_SIZE): number {
  const n = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
  const size = chunkSize > 0 ? Math.floor(chunkSize) : CHUNK_SIZE;
  return Math.ceil(n / size);
}

/** ค่าเฉลี่ย token ต่อ 1 call จากการวัดจริง (`.ai.md §4.3`) — ใช้ประมาณราคาก่อนกดสั่ง */
export const AVG_INPUT_TOKENS_PER_CALL = 2_400;
export const AVG_OUTPUT_TOKENS_PER_CALL = 3_818;

/** ประมาณราคาก่อนกดสั่ง AI (แสดงบน UI) จากจำนวนรายการ */
export function estimateJobCost(
  itemCount: number,
  pricing: CatalogPricing = getCatalogPricing(),
): CostEstimate {
  const calls = chunkCount(itemCount);
  return estimateCost(
    calls * AVG_INPUT_TOKENS_PER_CALL,
    calls * AVG_OUTPUT_TOKENS_PER_CALL,
    pricing,
  );
}

/** แสดงเป็นบาทแบบไทย (`4.07 ฿`) */
export function formatThb(thb: number): string {
  const v = Number.isFinite(thb) ? thb : 0;
  return `${new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)} ฿`;
}
