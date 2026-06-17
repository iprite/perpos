/**
 * Recall.ai — โมเดลต้นทุนแพลตฟอร์มบอท (แยกจากต้นทุน Gemini ใน stt-cost.ts)
 *
 * Recall คิด ~$0.50 ต่อชั่วโมงของ "recording" → ฐาน = วินาทีที่อัดจริง (duration_seconds ของ recall job)
 * ปรับ rate ผ่าน env `RECALL_BOT_USD_PER_HOUR` ได้โดยไม่ต้องแก้โค้ด (default 0.50)
 */

export function getRecallBotUsdPerHour(): number {
  const v = Number(process.env.RECALL_BOT_USD_PER_HOUR);
  return Number.isFinite(v) && v > 0 ? v : 0.5;
}

/** ต้นทุน Recall (USD) จากวินาทีที่อัด */
export function recallCostUsd(recordingSeconds: number): number {
  if (!Number.isFinite(recordingSeconds) || recordingSeconds <= 0) return 0;
  return (recordingSeconds / 3600) * getRecallBotUsdPerHour();
}
