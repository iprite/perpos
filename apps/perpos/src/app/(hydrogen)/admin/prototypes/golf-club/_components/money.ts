// money.ts — จัดรูปแบบตัวเลข/เงิน (golf-club prototype) ตาม DESIGN.md §3
// เงิน tabular + ยอดลบ U+2212 (−) ไม่ใช่ hyphen · ไทยทั้งหมด

/**
 * จัดรูปแบบจำนวนเงิน (th-TH) — ยอดลบขึ้นต้น U+2212 (−)
 * formatAmount(2200) → "2,200.00 ฿" · formatAmount(-500) → "−500.00 ฿"
 */
export function formatAmount(
  value: number,
  opts?: { decimals?: number; currency?: boolean },
): string {
  const decimals = opts?.decimals ?? 2;
  const currency = opts?.currency ?? true;
  const formatted = new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  const prefix = value < 0 ? "−" : "";
  const suffix = currency ? " ฿" : "";
  return `${prefix}${formatted}${suffix}`;
}

/** ย่อเงินหลักล้าน/พัน สำหรับ KPI tile แน่น ๆ — formatAmountShort(128400) → "฿128.4K" */
export function formatAmountShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}฿${(abs / 1_000).toFixed(1)}K`;
  return `${sign}฿${abs.toFixed(0)}`;
}

/** จำนวนทั่วไป (ไม่มีสกุลเงิน) — fmtNum(1450) → "1,450" */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
