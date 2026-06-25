// format.ts — helper จัดรูปแบบ HRM (production)
// ตาม DESIGN.md §3 (เงิน tabular + U+2212, วันที่ พ.ศ.)
// คัดจาก prototype hrm/_components/format.ts — ใช้ร่วมทุกหน้า [orgSlug]/hrm

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

/** ย่อยอดหลักล้านสำหรับ KPI tile (เก็บค่าเต็มไว้ใน sub) — fmtMoneyShort(1234567) → "฿1.2M" */
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

/** วันที่ พ.ศ. แบบสั้น — fmtDateTH("2026-06-22") → "22 มิ.ย. 2569" */
export function fmtDateTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** เวลาอย่างเดียว — fmtTimeTH("08:05") → "08:05" · รับ ISO timestamp ได้ด้วย */
export function fmtTimeTH(iso?: string | null): string {
  if (!iso) return "";
  if (/^\d{1,2}:\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ชื่อเต็ม — "สุรชัย วงศ์พิทักษ์" */
export function fullName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`;
}

/** เดือนจากปี+เลขเดือน (1-12) → "มิ.ย. 2569" — สำหรับ payroll run */
export function fmtPeriod(year: number, month: number): string {
  if (!year || !month) return "";
  return `${TH_MONTHS_SHORT[month - 1]} ${year + 543}`;
}
