// format.ts — helper จัดรูปแบบของ prototype accounting
// ตาม DESIGN.md §3 (เงิน tabular + U+2212, วันที่ พ.ศ.) · ไทยทั้งหมด

const TH_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const TH_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/**
 * จัดรูปแบบจำนวนเงิน (th-TH) — ยอดลบขึ้นต้น U+2212 (−) ไม่ใช่ hyphen
 * fmtMoney(28000) → "28,000.00 ฿" · fmtMoney(-500) → "−500.00 ฿"
 */
export function fmtMoney(value: number, opts?: { decimals?: number; currency?: boolean }): string {
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

/** ย่อยอดใหญ่เป็น ฿xxx (สำหรับ KPI tile แน่น ๆ) — fmtMoneyShort(1234567) → "฿1.23M" */
export function fmtMoneyShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}฿${(abs / 1_000).toFixed(1)}K`;
  return `${sign}฿${abs.toFixed(0)}`;
}

/** จำนวนทั่วไป (ไม่มีสกุลเงิน) */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** วันที่ พ.ศ. แบบสั้น — fmtDateTH("2026-06-26") → "26 มิ.ย. 2569" */
export function fmtDateTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** เดือน-ปี พ.ศ. แบบเต็ม — fmtMonthYearTH(2026, 6) → "มิถุนายน 2569" */
export function fmtMonthYearTH(year: number, month: number): string {
  return `${TH_MONTHS_FULL[month - 1]} ${year + 543}`;
}

/** อักษรย่อสำหรับ Avatar fallback (ตัวแรกของชื่อ) */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
  return name.slice(0, 2);
}
