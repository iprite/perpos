// format.ts — helper จัดรูปแบบของ prototype hotel
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

/** วันนี้อ้างอิงของ prototype = 23 มิ.ย. 2026 (ตรงกับ fixtures) */
export const TODAY_ISO = "2026-06-23";

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

/** จำนวนทั่วไป (ไม่มีสกุลเงิน) */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** วันที่ พ.ศ. แบบสั้น — fmtDateTH("2026-06-23") → "23 มิ.ย. 2569" */
export function fmtDateTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** วันที่+เวลา พ.ศ. — fmtDateTimeTH("2026-06-23T08:05:00Z") → "23 มิ.ย. 2569 08:05" */
export function fmtDateTimeTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDateTH(iso)} ${hh}:${mm}`;
}

/** อักษรย่อสำหรับ Avatar fallback (ตัวแรกของชื่อ) */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
  return name.slice(0, 2);
}

/** ช่วงวันเข้า-ออก พ.ศ. — "23 มิ.ย. – 27 มิ.ย. 2569" */
export function fmtStayRange(checkIn: string, checkOut?: string | null): string {
  if (!checkOut) return fmtDateTH(checkIn);
  return `${fmtDateTH(checkIn)} – ${fmtDateTH(checkOut)}`;
}

/** อายุการพัก — daily → "3 คืน", hourly → "6 ชม." */
export function fmtDuration(
  stayType: "daily" | "hourly",
  nights?: number | null,
  hours?: number | null,
): string {
  if (stayType === "hourly") return `${hours ?? 0} ชม.`;
  return `${nights ?? 0} คืน`;
}
