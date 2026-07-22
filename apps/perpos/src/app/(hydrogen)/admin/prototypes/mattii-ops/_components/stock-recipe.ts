// stock-recipe.ts — สูตรตัดสต๊อกของ prototype (Contract §3.17 "จุดตัดสต๊อก" — binding)
//
// จุด A  พิมพ์เสร็จ (ออเดอร์ printing → qc)          → ตัดวัสดุผลิต: ผ้าพรม · หมึก · ฟิล์มทรานสเฟอร์ · ยางรองหลัง
// จุด B  แพ็คเสร็จ (ออเดอร์ packing → ready_to_ship) → ตัดวัสดุแพ็ค: กล่อง · ถุงซิป · เทปกาว
//
// อัตราส่วนด้านล่างเป็น "สูตรโรงงาน" ของ prototype (ค่าประมาณที่เจ้าของร้านให้ไว้) — เก็บไว้ที่นี่ที่เดียว
// ห้ามคำนวณซ้ำในหน้า/ไฟล์อื่น. ทุกจุดเรียกผ่าน data-context (`advanceOrder`) เท่านั้น

import type { MattiiMaterial, MattiiOrderItem } from "../_fixtures/types";

/** หมึกที่ใช้ต่อผ้า 1 ตร.ม. (ลิตร) */
const INK_LITER_PER_SQM = 0.05;
/** ผ้าที่พิมพ์ได้ต่อฟิล์มทรานสเฟอร์ 1 ม้วน (ตร.ม.) */
const SQM_PER_FILM_ROLL = 12;
/** เทปกาวที่ใช้ต่อกล่อง 1 ใบ (ม้วน) */
const TAPE_ROLL_PER_BOX = 0.05;

export interface StockConsumeLine {
  material: MattiiMaterial;
  /** จำนวนที่ตัดออก (ค่าบวกเสมอ — ผู้เรียกใส่เครื่องหมายลบให้ qty_delta เอง) */
  qty: number;
  /** ข้อความกำกับ (ใช้ทั้งใน movement.reason และ order_cost.label) */
  label: string;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function activeOf(materials: MattiiMaterial[], category: MattiiMaterial["category"]) {
  return materials.filter((m) => m.category === category && m.is_active);
}

/** เลือกผ้าพรมที่ตรงกับชนิดผ้าของรายการ — ไม่เจอก็ใช้ผ้าตัวแรกในหมวด */
function pickFabric(materials: MattiiMaterial[], fabricType: string | null) {
  const pool = activeOf(materials, "rug_fabric");
  if (pool.length === 0) return undefined;
  if (!fabricType) return pool[0];
  const key = fabricType.replace(/\s+/g, "");
  return (
    pool.find((m) => {
      const name = m.name.replace(/\s+/g, "");
      return name.includes(key) || key.includes(name.slice(0, 6));
    }) ?? pool[0]
  );
}

function pickByName(
  materials: MattiiMaterial[],
  category: MattiiMaterial["category"],
  keyword: string,
) {
  const pool = activeOf(materials, category);
  return pool.find((m) => m.name.includes(keyword)) ?? pool[0];
}

/** ผ้าที่ต้องใช้รวมของออเดอร์ (ตร.ม.) — สูตรเดียวกับที่การ์ดงานผลิตแสดง */
export function fabricSqmOf(items: MattiiOrderItem[]): number {
  return Math.round(items.reduce((s, it) => s + it.fabric_usage_sqm * it.qty, 0) * 100) / 100;
}

/** จำนวนผืนรวมของออเดอร์ */
export function piecesOf(items: MattiiOrderItem[]): number {
  return items.reduce((s, it) => s + it.qty, 0);
}

/** จุด A — วัสดุที่ต้องตัดตอนพิมพ์เสร็จ */
export function printConsumption(
  items: MattiiOrderItem[],
  materials: MattiiMaterial[],
): StockConsumeLine[] {
  const sqm = fabricSqmOf(items);
  if (sqm <= 0) return [];
  const lines: StockConsumeLine[] = [];

  const fabric = pickFabric(materials, items[0]?.fabric_type ?? null);
  if (fabric) {
    lines.push({ material: fabric, qty: sqm, label: `${fabric.name} ${sqm} ตร.ม.` });
  }

  const ink = activeOf(materials, "ink")[0];
  if (ink) {
    const qty = round3(sqm * INK_LITER_PER_SQM);
    if (qty > 0) lines.push({ material: ink, qty, label: `${ink.name} ${qty} ลิตร` });
  }

  const film = activeOf(materials, "film")[0];
  if (film) {
    const qty = round3(sqm / SQM_PER_FILM_ROLL);
    if (qty > 0) lines.push({ material: film, qty, label: `${film.name} ${qty} ม้วน` });
  }

  const backing = activeOf(materials, "backing")[0];
  if (backing) {
    lines.push({ material: backing, qty: sqm, label: `${backing.name} ${sqm} ตร.ม.` });
  }

  return lines;
}

/** จุด B — วัสดุที่ต้องตัดตอนแพ็คเสร็จ */
export function packConsumption(
  packageCount: number,
  pieces: number,
  materials: MattiiMaterial[],
): StockConsumeLine[] {
  const boxes = Math.max(packageCount, 1);
  const lines: StockConsumeLine[] = [];

  const box = pickByName(materials, "packaging", "กล่อง");
  if (box) lines.push({ material: box, qty: boxes, label: `${box.name} ${boxes} ใบ` });

  const bag = pickByName(materials, "packaging", "ถุง");
  if (bag && pieces > 0 && bag.id !== box?.id) {
    lines.push({ material: bag, qty: pieces, label: `${bag.name} ${pieces} ใบ` });
  }

  const tape = pickByName(materials, "packaging", "เทป");
  if (tape && tape.id !== box?.id && tape.id !== bag?.id) {
    const qty = round3(boxes * TAPE_ROLL_PER_BOX);
    if (qty > 0) lines.push({ material: tape, qty, label: `${tape.name} ${qty} ม้วน` });
  }

  return lines;
}
