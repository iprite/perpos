/**
 * STT / MoM — โมเดลประมาณการต้นทุน Gemini ต่อนาที
 *
 * แหล่งข้อมูล: ledger `stt_usage_transactions` (kind debit/refund, duration_seconds)
 *   - debit  = จองโควต้าก่อนเรียก Gemini (วัดด้วย music-metadata)
 *   - refund = STT ล้ม → คืน (Gemini มักไม่ถูกคิดเงินเพราะล้มก่อน generateContent)
 *   ⇒ net = sum(debit) − sum(refund) ≈ วินาที/งานที่ Gemini ประมวลผลจริง = ฐานคิดต้นทุน
 *
 * ราคา Gemini เปลี่ยนได้ → ตั้งผ่าน env (default = gemini-2.5-flash, paid tier).
 * ค่า default อ้างอิงราคา ณ 2026-06; ปรับผ่าน Vercel env ได้โดยไม่ต้องแก้โค้ด
 * ⚠️ ค่าคงที่ชุดนี้ถูกสะท้อนใน scripts/stt-cost-report.mjs ด้วย — แก้แล้วซิงก์ทั้งสองที่
 */

export interface SttPricing {
  /** ราคา audio input token ($ ต่อ 1,000,000 tokens) */
  audioInputUsdPerMTok: number;
  /** ราคา text/image/video input token ($ ต่อ 1,000,000 tokens) — ใช้กับ prompt ที่ไม่ใช่เสียง */
  textInputUsdPerMTok: number;
  /** ราคา output token ($ ต่อ 1,000,000 tokens) */
  outputUsdPerMTok: number;
  /** Gemini tokenize เสียงที่ ~32 tokens ต่อวินาที */
  audioTokensPerSec: number;
  /** ประมาณ output tokens ต่องาน (MoM สรุป — เราไม่เก็บค่าจริงต่อ job) */
  outputTokensPerJob: number;
  /** อัตราแลกเปลี่ยน USD → THB สำหรับแสดงผล */
  usdThbRate: number;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function getSttPricing(): SttPricing {
  return {
    audioInputUsdPerMTok: num('STT_GEMINI_AUDIO_INPUT_USD_PER_M', 1.0),
    textInputUsdPerMTok: num('STT_GEMINI_TEXT_INPUT_USD_PER_M', 0.3),
    outputUsdPerMTok: num('STT_GEMINI_OUTPUT_USD_PER_M', 2.5),
    audioTokensPerSec: num('STT_GEMINI_AUDIO_TOKENS_PER_SEC', 32),
    outputTokensPerJob: num('STT_GEMINI_OUTPUT_TOKENS_PER_JOB', 3000),
    usdThbRate: num('STT_USD_THB_RATE', 35),
  };
}

export interface CostBasis {
  /** วินาทีที่ประมวลผลจริง (net debit) */
  seconds: number;
  /** จำนวนงานที่ประมวลผลจริง (net debit count) */
  jobs: number;
}

/** ต้นทุน Gemini โดยประมาณ (USD) สำหรับชุดงานที่ระบุ */
export function estimateGeminiCostUsd(basis: CostBasis, p: SttPricing): number {
  const audioTokens = Math.max(0, basis.seconds) * p.audioTokensPerSec;
  const outputTokens = Math.max(0, basis.jobs) * p.outputTokensPerJob;
  const inputUsd = (audioTokens / 1_000_000) * p.audioInputUsdPerMTok;
  const outputUsd = (outputTokens / 1_000_000) * p.outputUsdPerMTok;
  return inputUsd + outputUsd;
}

export interface TokenUsage {
  /** input token ที่เป็นเสียง (จาก usageMetadata.promptTokensDetails modality=AUDIO) */
  audioInputTokens: number;
  /** input token ที่ไม่ใช่เสียง (prompt ข้อความ) = promptTokens − audioInputTokens */
  textInputTokens: number;
  /** output token รวม thinking (candidatesTokenCount + thoughtsTokenCount) — คิดที่ราคา output */
  outputTokens: number;
}

/** ต้นทุน Gemini เป๊ะ (USD) จากจำนวน token จริงที่ Gemini รายงาน */
export function exactCostUsdFromTokens(u: TokenUsage, p: SttPricing): number {
  const audioUsd = (Math.max(0, u.audioInputTokens) / 1_000_000) * p.audioInputUsdPerMTok;
  const textUsd = (Math.max(0, u.textInputTokens) / 1_000_000) * p.textInputUsdPerMTok;
  const outUsd = (Math.max(0, u.outputTokens) / 1_000_000) * p.outputUsdPerMTok;
  return audioUsd + textUsd + outUsd;
}

export function usdToThb(usd: number, p: SttPricing): number {
  return usd * p.usdThbRate;
}

/** ต้นทุนเฉลี่ยต่อนาที (THB) จากชุดงาน — 0 ถ้าไม่มีนาที */
export function costPerMinuteThb(basis: CostBasis, p: SttPricing): number {
  const minutes = basis.seconds / 60;
  if (minutes <= 0) return 0;
  return usdToThb(estimateGeminiCostUsd(basis, p), p) / minutes;
}
