/**
 * ชื่อบ้านที่ "พูดกับลูกค้าได้" — แหล่งเดียวของทั้งฟีเจอร์
 *
 * เจ้าของสั่ง (2026-07-31): ห้ามบอกลูกค้าว่าบ้าน 4 ห้องนอนแยกเป็น "ธรรมดา" กับ "Pet Friendly"
 * เพราะลูกค้าที่ไม่ได้พาสัตว์เลี้ยงจะรู้สึกว่าเคยมีหมา/แมวมานอน แล้วไม่เอาหลังนั้น
 * → ลูกค้าเห็นแค่ 2 แบบ: Thammachat Grand (5 ห้องนอน) / Thammachat Villa (4 ห้องนอน)
 *   เรื่องรับสัตว์เลี้ยงพูดได้เฉพาะตอนลูกค้าถามเอง (กฎประจำตัวคุมอีกชั้น)
 */
export const GRAND_NAME = "Thammachat Grand (5 ห้องนอน)";
export const VILLA_NAME = "Thammachat Villa (4 ห้องนอน)";

export function publicVillaName(name: string): string {
  const t = name.toLowerCase();
  if (t.includes("grand") || name.includes("แกรนด์")) return GRAND_NAME;
  // pet friendly ถูกกลืนเข้าชื่อเดียวกับวิลล่าธรรมดาโดยตั้งใจ
  return VILLA_NAME;
}
