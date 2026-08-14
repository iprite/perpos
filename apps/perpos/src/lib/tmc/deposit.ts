/**
 * อัตราค่ามัดจำที่ตกลงกับลูกค้า (tmc_stays.deposit_amount)
 *
 * TMC ปรับอัตราค่ามัดจำจาก 5,000 → 10,000 บาท แต่ลูกค้าที่ตกลงไว้ก่อนปรับราคายังคิด 5,000
 * จึงต้องบันทึกไว้รายการต่อรายการว่าใช้อัตราไหน
 *
 * ⚠️ คนละช่องกับ `deposit_received` / `deposit_returned` ซึ่งเป็น "เงินที่เคลื่อนไหวจริง"
 * (ลงบัญชีอัตโนมัติ + หารเฉลี่ยรายห้อง) — ส่วนอัตรานี้เป็นค่าของ booking
 * จึงเก็บค่าเดียวกันทุกห้อง **ห้ามหารเฉลี่ย** และตอนอ่านกลับต้องหยิบค่าแรกไม่ใช่ผลรวม
 */

export const DEPOSIT_RATE_5K = "5000";
export const DEPOSIT_RATE_10K = "10000";

export type DepositRateMode = "none" | typeof DEPOSIT_RATE_5K | typeof DEPOSIT_RATE_10K | "other";

export const DEPOSIT_RATE_MODE_OPTIONS: { value: DepositRateMode; label: string }[] = [
  { value: "none", label: "ไม่ระบุ" },
  { value: DEPOSIT_RATE_5K, label: "5,000" },
  { value: DEPOSIT_RATE_10K, label: "10,000" },
  { value: "other", label: "อื่นๆ" },
];

/** โหมดของช่องเลือกอัตรา จากค่าที่เก็บอยู่ (string ของจำนวนเงิน · "" = ไม่ระบุ) */
export function depositRateModeOf(amount: string): DepositRateMode {
  if (!amount) return "none";
  if (amount === DEPOSIT_RATE_5K || amount === DEPOSIT_RATE_10K) return amount;
  return "other";
}

/** ค่าที่ควรเก็บเมื่อผู้ใช้สลับโหมด — "อื่นๆ" คงค่าที่พิมพ์ไว้ถ้ามันไม่ใช่อัตรามาตรฐาน */
export function depositAmountForMode(mode: DepositRateMode, current: string): string {
  if (mode === "none") return "";
  if (mode === "other") return depositRateModeOf(current) === "other" ? current : "";
  return mode;
}
