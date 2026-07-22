// empty-states.ts — ข้อความ empty state canonical (Contract v3 §8) — 4 หน้า
// UI ดึงจากที่นี่แทนพิมพ์เองในแต่ละหน้า (กันคำไม่ตรงกัน) — ตาม DESIGN.md §8 ต้องมี icon + คำอธิบาย + CTA
// (icon เลือกฝั่ง UI เอง — ที่นี่ให้แค่ title/description/cta เป็น data ล้วน)
export interface EmptyStateCopy {
  title: string;
  description: string;
  ctaLabel: string;
}

export const EMPTY_STATES = {
  /** กล่องแชทรวม — ไม่มีห้องแชท (filter ไม่เจอ หรือยังไม่มีแชทเข้ามาเลย) */
  inbox: {
    title: "ยังไม่มีแชทในตัวกรองนี้",
    description: "ลองเปลี่ยนช่องทางหรือสถานะที่กรองไว้ หรือรอแชทใหม่จากลูกค้าเข้ามา",
    ctaLabel: "ล้างตัวกรอง",
  } satisfies EmptyStateCopy,

  /** คิวผลิต — ไม่มีงานค้างในเลนนั้น ๆ (ข้อความบังคับตาม contract v3) */
  productionQueue: {
    title: "วันนี้ไม่มีงานค้าง",
    description:
      "ทุกงานในคิวนี้ผลิตเสร็จหรือยังไม่ถึงคิวเข้ามา ลองดูเลนอื่นหรือกลับมาเช็คใหม่ภายหลัง",
    ctaLabel: "ดูออเดอร์ทั้งหมด",
  } satisfies EmptyStateCopy,

  /** วัสดุ & สต๊อก — ไม่มีวัสดุตรงตัวกรอง (เช่น toggle "เฉพาะใกล้หมด" แล้วไม่มีรายการ) */
  materials: {
    title: "ไม่มีวัสดุที่ใกล้หมดตอนนี้",
    description: "สต๊อกวัสดุทุกรายการยังอยู่เหนือจุดสั่งซื้อ ไม่ต้องสั่งเพิ่มตอนนี้",
    ctaLabel: "ดูวัสดุทั้งหมด",
  } satisfies EmptyStateCopy,

  /** ออเดอร์ — ไม่มีออเดอร์ตรงตัวกรอง/ค้นหา */
  orders: {
    title: "ไม่พบออเดอร์ที่ตรงกับตัวกรอง",
    description: "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองสถานะ/ช่องทาง/ช่วงวันที่ดู",
    ctaLabel: "ล้างตัวกรองทั้งหมด",
  } satisfies EmptyStateCopy,
} as const;
