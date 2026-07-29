// format.ts — ตัวช่วยจัดรูปแบบที่หน้าคลังเอกสารใช้ร่วมกัน (ไทย/พ.ศ. ตาม DESIGN §14)
// ห้ามใส่คำไทยของ enum ที่นี่ — ของนั้นอยู่ที่ lib/acc-firm/vault/types.ts ที่เดียว

const TH_MONTHS = [
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

export const THAI_MONTH_OPTIONS = TH_MONTHS.map((label, i) => ({
  value: String(i + 1),
  label,
}));

/** "2026-07-29" → "29/07/2569" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${Number(y) + 543}`;
}

/** timestamp → "29/07/2569 14:05" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  const d = String(dt.getDate()).padStart(2, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const y = dt.getFullYear() + 543;
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

/** ปี ค.ศ. → "พ.ศ. 2569" */
export function fmtBuddhistYear(year: number): string {
  return `พ.ศ. ${year + 543}`;
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** งวดเดือน/ปี → ข้อความอ่านง่าย เช่น "กรกฎาคม 2569" หรือ "1 ม.ค. – 31 ธ.ค. 2569" */
export function fmtPeriodLabel(kind: "month" | "year", start: string, end: string): string {
  if (kind === "month") {
    const [y, m] = start.split("-");
    return `${TH_MONTHS[Number(m) - 1]} ${Number(y) + 543}`;
  }
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

/** วันครบกำหนดผ่านมาแล้วหรือยัง (เทียบวันที่ท้องถิ่นแบบ ISO) */
export function isOverdue(due: string | null | undefined, today = todayIso()): boolean {
  return Boolean(due) && (due as string) < today;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
