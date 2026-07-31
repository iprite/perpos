/**
 * format.ts — การแสดงผลตัวเลข/วันที่ของหน้าจอโมดูล just_me (ไม่ใช่สูตร)
 * ⛔ ที่นี่ **ห้ามมีการคำนวณเงิน** — สูตรทุกตัวอยู่ `lib/just-me/project-metrics.ts`
 * กติกา DESIGN §2/§3: ไม่มีข้อมูล → "—" (ไม่ใช่ 0) · ยอดลบใช้ U+2212 · tabular ที่ฝั่ง cell
 */

const THAI_MONTHS = [
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

/** เงินบาท — `null` = ยังไม่มีข้อมูล → "—" (ห้ามแสดง 0) */
export function money(v: number | null | undefined, opts?: { currency?: boolean }): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(v));
  return `${v < 0 ? "−" : ""}${s}${opts?.currency === false ? "" : " ฿"}`;
}

/** ย่อยอดใหญ่สำหรับการ์ด KPI (เก็บค่าเต็มไว้ใน sub) */
export function moneyShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 100_000) return `${sign}฿${(abs / 1_000).toFixed(0)}K`;
  return `${sign}฿${abs.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
}

/** สัดส่วน 0–1 → "25.0%" · null → "—" */
export function percent(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** ค่าที่เป็น % อยู่แล้ว (20 → "20%") */
export function pctValue(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/** จำนวนนับ/ปริมาณ — ไม่ใช่เงิน จึงไม่ใส่ ฿ */
export function qtyText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/** "2026-07-15" → "15 ก.ค. 2569" (พ.ศ. บนจอ, CE ใน DB) */
export function thaiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}
