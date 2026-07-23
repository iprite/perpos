// format.ts — helper จัดรูปแบบของ prototype mattii_ops
// ตาม DESIGN.md §3 (เงิน tabular + U+2212, วันที่ พ.ศ.) · ภาษาไทยทั้งหมด

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
 * จำนวนเงิน (th-TH) — ยอดลบขึ้นต้นด้วย U+2212 (−) ไม่ใช่ hyphen
 * fmtMoney(1234.5) → "1,234.50 ฿" · fmtMoney(-500) → "−500.00 ฿"
 */
export function fmtMoney(value: number, opts?: { decimals?: number; currency?: boolean }): string {
  const decimals = opts?.decimals ?? 2;
  const currency = opts?.currency ?? true;
  const formatted = new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  const prefix = value < 0 ? "−" : "";
  return `${prefix}${formatted}${currency ? " ฿" : ""}`;
}

/** จำนวนทั่วไป (ไม่มีสกุลเงิน) */
export function fmtNum(value: number, decimals = 0): string {
  const formatted = new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(value));
  return `${value < 0 ? "−" : ""}${formatted}`;
}

/** เปอร์เซ็นต์ — fmtPercent(31.4) → "31.4%" */
export function fmtPercent(value: number, decimals = 1): string {
  return `${fmtNum(value, decimals)}%`;
}

/** วันที่ พ.ศ. แบบสั้น — fmtDateTH("2026-07-22") → "22 ก.ค. 2569" */
export function fmtDateTH(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** วันที่+เวลา พ.ศ. — "22 ก.ค. 2569 14:05" */
export function fmtDateTimeTH(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDateTH(iso)} ${hh}:${mm}`;
}

/** วันนี้แบบ ISO (YYYY-MM-DD) */
export function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** จำนวนวันจากวันนี้ถึงวันที่กำหนด (ลบ = เลยมาแล้ว) */
export function daysUntil(dateIso?: string | null): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** ข้อความ "เหลือ X วัน" / "เลยมาแล้ว X วัน" / "ครบกำหนดวันนี้" */
export function fmtDueHint(dateIso?: string | null): string {
  const d = daysUntil(dateIso);
  if (d === null) return "ไม่ระบุกำหนด";
  if (d === 0) return "ครบกำหนดวันนี้";
  if (d < 0) return `เลยกำหนดมาแล้ว ${Math.abs(d)} วัน`;
  return `เหลืออีก ${d} วัน`;
}

/** อายุนับจากเวลาที่กำหนดถึงตอนนี้ (วัน) */
export function ageInDays(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}
