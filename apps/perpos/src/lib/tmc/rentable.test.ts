import { describe, expect, it } from "vitest";
import { availableNightsIn, isOpenOn, openCodesOn } from "./rentable";

const PROPS = [
  { code: "TMC1", rentable_from: null },
  { code: "TMC5", rentable_from: null },
  { code: "TMC7", rentable_from: null },
  { code: "TMC2", rentable_from: "2026-12-01" },
  { code: "TMC3-4", rentable_from: "2026-12-01" },
];

describe("ห้องเปิดขายของ TMC", () => {
  it("rentable_from ว่าง = เปิดขายมาตลอด", () => {
    expect(isOpenOn({ code: "TMC1", rentable_from: null }, "2020-01-01")).toBe(true);
  });

  it("ห้องที่มีวันเปิด — นับตั้งแต่วันเปิดเป็นต้นไป (วันเปิดนับด้วย)", () => {
    const p = { code: "TMC2", rentable_from: "2026-12-01" };
    expect(isOpenOn(p, "2026-11-30")).toBe(false);
    expect(isOpenOn(p, "2026-12-01")).toBe(true);
  });

  it("ห้องเปิดขาย ณ วันหนึ่ง ๆ — ก่อน ธ.ค. 3 ห้อง · ตั้งแต่ ธ.ค. 5 ห้อง", () => {
    expect(openCodesOn(PROPS, "2026-08-20")).toEqual(["TMC1", "TMC5", "TMC7"]);
    expect(openCodesOn(PROPS, "2026-12-01")).toHaveLength(5);
  });

  it("ตัวหารรายเดือนไม่ย้อนหลัง — ส.ค. = 3×31, ธ.ค. = 5×31", () => {
    expect(availableNightsIn(PROPS, "2026-08-01", "2026-09-01")).toBe(93);
    expect(availableNightsIn(PROPS, "2026-12-01", "2027-01-01")).toBe(155);
  });

  it("เดือนที่ห้องเปิดกลางเดือน นับเฉพาะคืนหลังวันเปิด", () => {
    const props = [
      { code: "A", rentable_from: null },
      { code: "B", rentable_from: "2026-11-16" },
    ];
    // พ.ย. 30 วัน: A ครบ 30 คืน + B 15 คืน (16–30 พ.ย.)
    expect(availableNightsIn(props, "2026-11-01", "2026-12-01")).toBe(45);
  });
});
