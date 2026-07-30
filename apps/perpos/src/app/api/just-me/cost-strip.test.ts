/**
 * เทสด่านสิทธิ์ต้นทุนของชั้น API — "ผิดแล้วผู้รับเหมาช่วงเห็นต้นทุนเรา" (contract §4.6)
 * ⛔ ถ้าเพิ่มคอลัมน์ต้นทุนใหม่ที่ไหน ต้องมาเพิ่มใน COST_FIELDS แล้วเทสนี้ต้องยังผ่าน
 */

import { describe, expect, it } from "vitest";
import { COST_FIELDS, canSeeCost, stripCost, stripCostList } from "./_lib";

const boqItem = {
  id: "1",
  name: "สายไฟ",
  qty: 10,
  unit_price: 18,
  amount: 180,
  material_unit_cost: 10,
  labor_unit_cost: 4,
  overhead_unit_cost: 1,
  cost_amount: 150,
  margin_pct: 20,
  margin_source: "company",
};

describe("สิทธิ์เห็นต้นทุน", () => {
  it("owner/manager เห็นครบ · viewer ไม่เห็น", () => {
    expect(canSeeCost("owner")).toBe(true);
    expect(canSeeCost("manager")).toBe(true);
    expect(canSeeCost("viewer")).toBe(false);
  });

  it("viewer ต้องไม่ได้รับคีย์ต้นทุนกลับไปเลย (ไม่ใช่แค่ค่าเป็น null)", () => {
    const out = stripCost(boqItem, "viewer");
    for (const key of [
      "material_unit_cost",
      "labor_unit_cost",
      "overhead_unit_cost",
      "cost_amount",
      "margin_pct",
      "margin_source",
    ]) {
      expect(key in out).toBe(false);
    }
    // ฝั่งราคาขายยังต้องอยู่ครบ (viewer ต้องทำงานได้)
    expect(out.qty).toBe(10);
    expect(out.unit_price).toBe(18);
    expect(out.amount).toBe(180);
  });

  it("owner ได้ของเดิมทั้งก้อน", () => {
    expect(stripCost(boqItem, "owner")).toEqual(boqItem);
    expect(stripCostList([boqItem], "manager")).toEqual([boqItem]);
  });

  it("ตัดทุกคีย์ใน COST_FIELDS จริง", () => {
    const all = Object.fromEntries(COST_FIELDS.map((k) => [k, 1]));
    expect(Object.keys(stripCost({ ...all, keep: 1 }, "viewer"))).toEqual(["keep"]);
  });

  it("สรุปตัวเลขโครงการของ viewer เหลือเฉพาะฝั่งขาย", () => {
    const summary = {
      contract_amount: 1000,
      budget_cost: 700,
      actual_cost: 300,
      committed_cost: 100,
      forecast_cost: 800,
      forecast_profit: 200,
      forecast_margin_pct: 0.2,
      actual_profit: null,
      cost_variance: -300,
      progress_pct: 0.5,
      billed_amount: 400,
      unbilled_amount: 600,
      over_budget: false,
    };
    expect(stripCost(summary, "viewer")).toEqual({
      contract_amount: 1000,
      progress_pct: 0.5,
      billed_amount: 400,
      unbilled_amount: 600,
    });
  });
});
