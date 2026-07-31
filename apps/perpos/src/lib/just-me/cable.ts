/**
 * cable.ts — กฎของวัสดุที่ "ตัดเป็นเมตร" (`just_me_inventory_items.has_cable_measurement`)
 *
 * โมเดล (ตกลงไว้ที่นี่ที่เดียว — หน้าเว็บกับ API ห้ามคิดเอง):
 *   · ยอดคงเหลือของคลัง (`just_me_stock_balances`) นับเป็น **หน่วยของวัสดุ** (ม้วน/เส้น) เหมือนวัสดุอื่น
 *   · "เศษสาย" = ทะเบียนความยาวที่ตัดเหลือ เก็บเป็นแถวใน `just_me_item_serials`
 *     (`length_remaining` = เมตรที่เหลือ · `is_scrap` = สั้นจนใช้ได้เฉพาะจุดย่อย)
 *     — เศษ **ไม่กระทบยอดคงเหลือ/ต้นทุนเฉลี่ย** เพราะมูลค่าของม้วนถูกตัดออกไปแล้วตอนเบิก
 *   · หยิบเศษมาใช้ = ตัดความยาวออกจากทะเบียน ใช้หมดเมื่อเหลือ 0 (ไม่มีรายการคลังใหม่)
 *
 * ⛔ เกณฑ์ "เศษสั้น" มีที่เดียวคือ `CABLE_SCRAP_THRESHOLD_M` — เดิมฮาร์ดโค้ด `< 5` สองจุดใน API
 *    และเทียบกับ `Number("")` ที่ได้ 0 ⇒ ม้วนเต็มที่ไม่ได้กรอกความยาวติดธง "เศษ" ทันที
 */

/** เศษที่สั้นกว่ากี่เมตรถือว่า "เศษสั้น" (ใช้ได้เฉพาะจุดย่อย ไม่ควรนับเป็นของพร้อมใช้) */
export const CABLE_SCRAP_THRESHOLD_M = 5;

export type CableLengthParse = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * อ่านค่าความยาวจากฟอร์ม
 * — ปล่อยว่าง/ไม่ส่งมา = `null` ("ไม่ได้ระบุ") ไม่ใช่ 0
 * — ตัวเลขติดลบ/กรอกมั่ว = error (ห้ามกลืนเงียบ)
 */
export function parseCableLength(raw: unknown): CableLengthParse {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "string" && raw.trim() === "") return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: "ความยาวสายไฟไม่ถูกต้อง" };
  if (n < 0) return { ok: false, error: "ความยาวสายไฟต้องไม่ติดลบ" };
  return { ok: true, value: round2(n) };
}

/** เศษสั้นไหม — ไม่ได้ระบุความยาว (null) หรือใช้หมดแล้ว (0) = ไม่ใช่เศษสั้น */
export function isScrapLength(length: number | null): boolean {
  if (length === null) return false;
  return length > 0 && length < CABLE_SCRAP_THRESHOLD_M;
}

/**
 * ออกรหัสเศษให้อัตโนมัติ (ผู้ใช้ไม่ต้องคิดเอง) — `SCR-<รหัสวัสดุ>-0001`
 * `existing` = รหัสที่มีอยู่แล้วของวัสดุตัวนั้น (กันเลขชนกัน)
 */
export function nextScrapCode(itemCode: string, existing: readonly string[]): string {
  const base = (itemCode || "ITEM").toUpperCase().replace(/\s+/g, "");
  const prefix = `SCR-${base}-`;
  let max = 0;
  for (const code of existing) {
    if (!code.startsWith(prefix)) continue;
    const n = Number(code.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export type ScrapUsage =
  | { ok: true; lengthRemaining: number; status: "in_stock" | "issued"; isScrap: boolean }
  | { ok: false; error: string };

/** หยิบเศษมาใช้ — ตัดความยาวออก, ใช้จนหมดแล้วปิดเส้นนั้น */
export function applyScrapUsage(remaining: number | null, used: number): ScrapUsage {
  if (remaining === null || !Number.isFinite(remaining) || remaining <= 0) {
    return { ok: false, error: "เส้นนี้ไม่มีความยาวเหลือให้ใช้แล้ว" };
  }
  if (!Number.isFinite(used) || used <= 0) {
    return { ok: false, error: "กรุณาระบุความยาวที่ใช้ (มากกว่า 0 เมตร)" };
  }
  if (round2(used) > round2(remaining)) {
    return { ok: false, error: `ใช้ได้ไม่เกินความยาวที่เหลือ (${round2(remaining)} เมตร)` };
  }
  const left = round2(remaining - used);
  if (left <= 0) return { ok: true, lengthRemaining: 0, status: "issued", isScrap: false };
  return { ok: true, lengthRemaining: left, status: "in_stock", isScrap: isScrapLength(left) };
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
