// format.ts — helper วันที่/เวลา (golf-club prototype) — พ.ศ. ใน UI, เก็บ CE
// วันนี้อ้างอิงของ prototype = 12 ก.ค. 2026 (ตรงกับ fixtures bookings.ts / ai-mocks.ts)

export const TODAY_ISO = "2026-07-12";

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

const TH_DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const TH_DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** วันที่ พ.ศ. แบบสั้น — fmtDateTH("2026-07-12") → "12 ก.ค. 2569" */
export function fmtDateTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${TH_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

/** วันในสัปดาห์ (ไทยเต็ม) — dowTH("2026-07-12") → "อาทิตย์" */
export function dowTH(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return TH_DOW[d.getUTCDay()];
}

/** วันที่+เวลา พ.ศ. — fmtDateTimeTH("2026-07-12T03:00:00Z") → "12 ก.ค. 2569 03:00" */
export function fmtDateTimeTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${fmtDateTH(iso)} ${hh}:${mm}`;
}

/** อักษรย่อสำหรับ Avatar fallback */
export function initials(name: string): string {
  const clean = name.replace(/^คุณ\s*/, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
  return clean.slice(0, 2);
}

/** เพิ่ม N วันจาก ISO — addDayIso("2026-07-12", 1) → "2026-07-13" */
export function addDayIso(iso: string, n = 1): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
