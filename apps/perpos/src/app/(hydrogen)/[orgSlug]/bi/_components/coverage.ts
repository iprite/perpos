/**
 * ความครอบคลุมของตัวเลข — logic เดียวที่ใช้ทั้งหน้าแชท (AnswerCard) และการ์ดแดชบอร์ด
 * (DashboardCard) · ห้ามทำสูตรแยกต่อหน้า
 *
 * กับดัก D1: metric บางตัวนับ "เฉพาะใบที่กรอกค่าแล้ว" (รวม VAT / ต้นทุนซื้อของ) ขณะที่
 * metric คู่กันนับครบทุกใบ — ถ้า UI ไม่บอกจำนวนใบที่ถูกนับจริง ผู้ใช้จะเอาสองยอดมาลบกัน
 * (คิดว่าเป็นภาษี) หรือหารด้วยจำนวนใบทั้งหมด (ได้ค่าเฉลี่ยต่ำกว่าจริง) ซึ่งผิดทั้งคู่
 */

/** ฐานที่นับได้จริง: ราคาขาย (`priced_count`) หรือ ราคาทุน (`costed_count`) */
export type CoverageKind = "price" | "cost";

export interface Coverage {
  orderCount: number;
  /** จำนวนรายการที่กรอกค่าครบจึงถูกนับ — null = metric ไม่ได้คืนคอลัมน์นี้ */
  filledCount: number | null;
  kind: CoverageKind | null;
}

/**
 * รวม `order_count` + (`priced_count` | `costed_count`) จากทุกแถวของผลลัพธ์
 * — metric ไหนคืนคอลัมน์ไหนก็ใช้ตัวนั้น (ไม่มีทั้งคู่ = บอกแค่ order_count)
 */
export function coverageOf(rows: Array<Record<string, unknown>>): Coverage | null {
  if (!rows || rows.length === 0) return null;
  const sum = (key: string): number | null => {
    let total = 0;
    let found = false;
    for (const r of rows) {
      const v = r[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        found = true;
      }
    }
    return found ? total : null;
  };

  const orderCount = sum("order_count");
  if (orderCount === null) return null;

  const priced = sum("priced_count");
  if (priced !== null) return { orderCount, filledCount: priced, kind: "price" };

  const costed = sum("costed_count");
  if (costed !== null) return { orderCount, filledCount: costed, kind: "cost" };

  return { orderCount, filledCount: null, kind: null };
}

/** คำที่ใช้เรียกค่าที่ต้องกรอก — ต้องตรงกับฐานที่ metric นับจริง */
export function coverageNoun(kind: CoverageKind | null): string {
  return kind === "cost" ? "ต้นทุน" : "ราคา";
}
