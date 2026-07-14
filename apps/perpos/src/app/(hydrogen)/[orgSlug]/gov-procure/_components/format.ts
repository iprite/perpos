// format.ts — helper จัดรูปแบบ (production gov_procure)
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

/**
 * "วันนี้" (production = เวลาจริง) — ประเมินครั้งเดียวตอน import ต่อ session
 * ใช้คิด aging/overdue ฝั่ง client ให้ตรงกับ lib/gov-procure (computeAging ใช้ new Date())
 */
export const TODAY_DATE = new Date();
export const TODAY_ISO = TODAY_DATE.toISOString().slice(0, 10);

/**
 * จัดรูปแบบจำนวนเงิน (th-TH) — ยอดลบขึ้นต้น U+2212 (−) ไม่ใช่ hyphen
 * fmtMoney(27900) → "27,900.00 ฿" · fmtMoney(-500) → "−500.00 ฿"
 */
export function fmtMoney(
  value: number | null | undefined,
  opts?: { decimals?: number; currency?: boolean },
): string {
  if (value == null) return "—";
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

/** ย่อยอดหลักล้านสำหรับ KPI tile — fmtMoneyShort(2406359) → "฿2.41M" */
export function fmtMoneyShort(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const prefix = value < 0 ? "−฿" : "฿";
  if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${prefix}${(abs / 1_000).toFixed(1)}K`;
  return `${prefix}${abs.toFixed(0)}`;
}

/** จำนวนทั่วไป (ไม่มีสกุลเงิน) — fmtNum(27) → "27" */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** วันที่ พ.ศ. แบบสั้น — fmtDateTH("2026-06-08") → "8 มิ.ย. 2569" */
export function fmtDateTH(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}
