/**
 * ประเภทการเข้าพักของ TMC — แหล่งนิยามเดียวว่า "ครั้งนี้ได้เงินหรือไม่"
 *
 * **กติกาที่ยึด (binding): ประเภทเป็นตัวตัดสิน ไม่ใช่ตัวเลขในช่องค่าห้อง**
 * การเข้าพักที่ไม่ใช่ `paid` ถือว่า **ไม่ได้รับเงิน** แม้จะมีค่าห้องกรอกไว้
 * (เคยเจอใบอินฟลูฯ ใส่ราคาเต็มไว้เป็น "มูลค่าห้องที่แลกไป" และใบฟรีที่กรอก 10 ฿/4 ฿
 *  → ถ้านับตามตัวเลข รายได้จะโป่งทั้งที่ไม่มีเงินเข้าจริง)
 *
 * ⇒ ทุกที่ที่รวมเงินค่าห้องต้องผ่าน `stayRevenueOf()` ห้ามอ่าน `room_rate` ตรง ๆ
 */

/** ชนิดการเข้าพักที่ "ไม่เกิดรายได้ค่าห้อง" — ให้ห้องฟรี (อินฟลู/ผู้บริหาร/ฟรีอื่น ๆ) */
export const NON_REVENUE_STAY_TYPES = new Set(["influencer", "management", "free"]);

/** การเข้าพักครั้งนี้คิดเงินไหม (ค่าว่าง/ไม่รู้จัก = ถือว่าคิดเงิน ตาม default `paid`) */
export function isRevenueStay(stayType: string | null | undefined): boolean {
  return !NON_REVENUE_STAY_TYPES.has(stayType ?? "");
}

/** ค่าห้องที่นับเป็นรายได้จริงของ 1 การเข้าพัก — ประเภทที่ไม่คิดเงินได้ 0 เสมอ */
export function stayRevenueOf(row: {
  stay_type?: string | null;
  room_rate?: number | string | null;
}): number {
  return isRevenueStay(row.stay_type) ? Number(row.room_rate ?? 0) : 0;
}
