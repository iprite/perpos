/**
 * lib/bi/cost.ts — โมเดลราคา Gemini ของ BI Chat (mirror `lib/assistant/stt-cost.ts`)
 *
 * ทุกคำถามใช้ Gemini ~2 call (intent + narration) + 1 embedding → ต้องรู้ต้นทุนต่อคำถามจริง
 * ก่อนตั้งราคาขาย · ค่าที่คิดได้จากไฟล์นี้ถูกบันทึกลง `bi_query_log.cost_usd` ทุกครั้ง (§5)
 *
 * AI provider = **Gemini เท่านั้น** (AGENTS §Conventions) · ราคาปรับผ่าน env ได้โดยไม่ต้องแก้โค้ด
 * ค่า default อ้างอิงราคา gemini-2.5-flash + gemini-embedding-001 ณ 2026-07 (paid tier)
 */

export interface BiPricing {
  /** ราคา text input token ($ ต่อ 1,000,000 tokens) */
  textInputUsdPerMTok: number;
  /** ราคา output token ($ ต่อ 1,000,000 tokens) — รวม thinking tokens */
  outputUsdPerMTok: number;
  /** ราคา embedding token ($ ต่อ 1,000,000 tokens) */
  embedInputUsdPerMTok: number;
  /** อัตราแลกเปลี่ยน USD → THB สำหรับแสดงผล */
  usdThbRate: number;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function getBiPricing(): BiPricing {
  return {
    textInputUsdPerMTok: num("BI_GEMINI_TEXT_INPUT_USD_PER_M", 0.3),
    outputUsdPerMTok: num("BI_GEMINI_OUTPUT_USD_PER_M", 2.5),
    embedInputUsdPerMTok: num("BI_GEMINI_EMBED_USD_PER_M", 0.15),
    usdThbRate: num("BI_USD_THB_RATE", 35),
  };
}

/** token ที่ใช้จริงต่อหนึ่งคำถาม (รวมทุก call) — มาจาก `usageMetadata` ของ Gemini */
export interface BiTokenUsage {
  /** prompt token ของ call ที่เป็น chat (intent + narration) */
  tokenIn: number;
  /** output token รวม thinking */
  tokenOut: number;
  /** token ที่ใช้กับ embedding ของคำถาม (ถ้ามี) */
  embedTokens?: number;
}

/** ต้นทุน Gemini (USD) ของคำถามหนึ่งข้อ */
export function estimateBiCostUsd(usage: BiTokenUsage, p: BiPricing = getBiPricing()): number {
  const inUsd = (Math.max(0, usage.tokenIn) / 1_000_000) * p.textInputUsdPerMTok;
  const outUsd = (Math.max(0, usage.tokenOut) / 1_000_000) * p.outputUsdPerMTok;
  const embedUsd = (Math.max(0, usage.embedTokens ?? 0) / 1_000_000) * p.embedInputUsdPerMTok;
  return inUsd + outUsd + embedUsd;
}

export function biUsdToThb(usd: number, p: BiPricing = getBiPricing()): number {
  return usd * p.usdThbRate;
}

/** เพดานคำถามต่อคน/วัน (§5 query guardrails) — ปรับผ่าน env `BI_DAILY_LIMIT` */
export function getBiDailyLimit(): number {
  return Math.trunc(num("BI_DAILY_LIMIT", 50));
}
