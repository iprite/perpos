// format.ts — helper จัดรูปแบบของ prototype nursing_home
// ตาม DESIGN.md §3 (เงิน tabular + U+2212, วันที่ พ.ศ.)
// shared foundation — ทุกหน้า import จาก "../_components/format"

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
 * จัดรูปแบบจำนวนเงิน (th-TH) — ยอดลบขึ้นต้น U+2212 (−) ไม่ใช่ hyphen
 * fmtMoney(28000) → "28,000.00 ฿"
 * fmtMoney(-500) → "−500.00 ฿"
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

/**
 * ย่อยอดหลักล้านสำหรับ KPI tile (เก็บค่าเต็มไว้ใน sub)
 * fmtMoneyShort(1234567) → "฿1.2M"
 */
export function fmtMoneyShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}฿${(abs / 1_000).toFixed(0)}K`;
  return `${sign}฿${abs.toLocaleString("th-TH")}`;
}

/** จำนวนทั่วไป (ไม่มีสกุลเงิน) */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * วันที่ พ.ศ. แบบสั้น — fmtDateTH("2026-06-22") → "22 มิ.ย. 2569"
 * รับ ISO date หรือ datetime, คืน "" ถ้าว่าง/parse ไม่ได้
 */
export function fmtDateTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * วันที่+เวลา พ.ศ. — fmtDateTimeTH("2026-06-22T08:05:00Z") → "22 มิ.ย. 2569 08:05"
 */
export function fmtDateTimeTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDateTH(iso)} ${hh}:${mm}`;
}

/** เวลาอย่างเดียว — fmtTimeTH("2026-06-22T08:05:00Z") → "08:05" */
export function fmtTimeTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** คำนวณอายุจากวันเกิด (ปีเต็ม) — calcAge("1944-03-12") → 82 (อ้างอิงวันนี้) */
export function calcAge(birthDateIso?: string | null): number | null {
  if (!birthDateIso) return null;
  const b = new Date(birthDateIso);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

/** ชื่อเต็ม + ฉายา — "สมจิตร พันธุ์ดี (ยายจิตร)" */
export function fullName(p: {
  first_name: string;
  last_name: string;
  nickname?: string | null;
}): string {
  const base = `${p.first_name} ${p.last_name}`;
  return p.nickname ? `${base} (${p.nickname})` : base;
}

/** อักษรย่อสำหรับ Avatar fallback */
export function initials(p: { first_name: string; last_name: string }): string {
  return `${p.first_name.charAt(0)}${p.last_name.charAt(0)}`;
}

/** เดือน "YYYY-MM" → "มิ.ย. 2569" */
export function fmtMonthTH(periodMonth?: string | null): string {
  if (!periodMonth) return "";
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m) return periodMonth;
  return `${TH_MONTHS_SHORT[m - 1]} ${y + 543}`;
}
