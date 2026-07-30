/**
 * เทสของบรรทัด BOQ — "ผิดแล้วเสนอราคาขาดทุน" จึงต้องมีเทสคุม
 * ครอบ: margin resolve 4 ชั้น → ราคาขาย/ยอดรวมของบรรทัด + ด่านค่าที่กรอกผิด
 */

import { describe, expect, it } from "vitest";
import { buildBoqItemRow } from "./boq";

const base = { name: "สายไฟ THW 2.5", unit: "เมตร", qty: 100 };
const noMargins = { priceBook: null, category: null, project: null, company: null };

describe("buildBoqItemRow", () => {
  it("คิดราคาขาย/ยอดรวมจากต้นทุน 3 ก้อน + margin (ห้ามรับยอดจากผู้เรียก)", () => {
    const res = buildBoqItemRow(
      { ...base, material_unit_cost: 10, labor_unit_cost: 4, overhead_unit_cost: 1 },
      { ...noMargins, company: 20 },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.unit_price).toBe(18); // (10+4+1) × 1.20
    expect(res.row.amount).toBe(1800);
    expect(res.row.cost_amount).toBe(1500);
    expect(res.row.margin_pct).toBe(20);
    expect(res.row.margin_source).toBe("company");
  });

  it("margin ที่ตั้งมือบนบรรทัดชนะทุกชั้น และบันทึกที่มาเป็น item", () => {
    const res = buildBoqItemRow(
      { ...base, qty: 1, material_unit_cost: 100, margin_pct: 50 },
      { priceBook: 10, category: 15, project: 20, company: 25 },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.margin_pct).toBe(50);
    expect(res.row.margin_source).toBe("item");
    expect(res.row.unit_price).toBe(150);
  });

  it("ไม่มี margin ชั้นไหนเลย → 0% (ขายเท่าทุน) ไม่ใช่ราคามั่ว", () => {
    const res = buildBoqItemRow({ ...base, qty: 2, material_unit_cost: 50 }, noMargins);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.unit_price).toBe(50);
    expect(res.row.amount).toBe(100);
  });

  it("ต้นทุนที่ไม่ได้ส่งมา ถือเป็น 0 — แต่ปริมาณ/ชื่อ/หน่วยที่ผิดต้องถูกปฏิเสธ", () => {
    expect(buildBoqItemRow({ ...base, qty: 0 }, noMargins).ok).toBe(false);
    expect(buildBoqItemRow({ ...base, qty: -1 }, noMargins).ok).toBe(false);
    expect(buildBoqItemRow({ ...base, name: "  " }, noMargins).ok).toBe(false);
    expect(buildBoqItemRow({ ...base, unit: "" }, noMargins).ok).toBe(false);
    expect(buildBoqItemRow({ ...base, material_unit_cost: -5 }, noMargins).ok).toBe(false);
  });

  it("ชนิดรายการที่ไม่รู้จัก → ตกกลับเป็น material (ไม่ปล่อยค่าแปลกลง DB)", () => {
    const res = buildBoqItemRow({ ...base, item_kind: "ห้ามใช้" }, noMargins);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.item_kind).toBe("material");
  });
});
