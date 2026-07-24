import { describe, expect, it } from "vitest";
import { coverageNoun, coverageOf } from "./coverage";

describe("coverageOf", () => {
  it("ไม่มีแถว → null", () => {
    expect(coverageOf([])).toBeNull();
  });

  it("ไม่มี order_count → null (ไม่รู้ฐาน จึงไม่โชว์อะไรมั่ว)", () => {
    expect(coverageOf([{ total_amount: 100 }])).toBeNull();
  });

  it("มีแต่ order_count → filledCount null", () => {
    expect(coverageOf([{ order_count: 17 }])).toEqual({
      orderCount: 17,
      filledCount: null,
      kind: null,
    });
  });

  it("priced_count → kind price (metric ราคา)", () => {
    expect(coverageOf([{ order_count: 17, priced_count: 13 }])).toEqual({
      orderCount: 17,
      filledCount: 13,
      kind: "price",
    });
  });

  it("costed_count → kind cost (การ์ดต้นทุนซื้อของ: 12 จาก 17 ใบ ไม่ใช่ 17)", () => {
    expect(coverageOf([{ order_count: 17, costed_count: 12 }])).toEqual({
      orderCount: 17,
      filledCount: 12,
      kind: "cost",
    });
  });

  it("รวมทุกแถวเมื่อผลลัพธ์แตกตามมิติ", () => {
    const rows = [
      { order_count: 10, costed_count: 6 },
      { order_count: 7, costed_count: 6 },
    ];
    expect(coverageOf(rows)).toEqual({ orderCount: 17, filledCount: 12, kind: "cost" });
  });

  it("คำที่ใช้เรียกต้องตรงฐาน", () => {
    expect(coverageNoun("cost")).toBe("ต้นทุน");
    expect(coverageNoun("price")).toBe("ราคา");
    expect(coverageNoun(null)).toBe("ราคา");
  });
});
