/**
 * format.test.ts — คุมรูปแบบตัวเลขของคำตอบ BI (DESIGN §3/§14)
 * ยอดลบต้องเป็น U+2212 (`−`) ไม่ใช่ hyphen — ผิด = หลุด standard ทั้งเว็บและ LINE
 */
import { describe, it, expect } from "vitest";
import { formatMetricValue, formatDeltaPercent, MINUS } from "./format";

describe("formatMetricValue — เงิน (thb)", () => {
  it("คั่นหลักพัน + ทศนิยม 2 + ฿ ต่อท้าย", () => {
    expect(formatMetricValue(1234567.891, "thb")).toBe("1,234,567.89 ฿");
  });

  it("ยอดลบใช้ U+2212 ไม่ใช่ hyphen", () => {
    const out = formatMetricValue(-50000, "thb");
    expect(out).toBe(`${MINUS}50,000.00 ฿`);
    expect(MINUS).toBe("−");
    expect(out.includes("-")).toBe(false);
  });

  it("withUnit=false → ไม่มี ฿", () => {
    expect(formatMetricValue(1000, "thb", { withUnit: false })).toBe("1,000.00");
  });

  it("ค่าที่ปัดแล้วเป็น 0 ไม่ติดลบ (กัน −0.00)", () => {
    expect(formatMetricValue(-0.001, "thb")).toBe("0.00 ฿");
  });
});

describe("formatMetricValue — หน่วยอื่น", () => {
  it("count = จำนวนเต็ม ไม่มีทศนิยม", () => {
    expect(formatMetricValue(1234, "count")).toBe("1,234");
  });

  it("days = ต่อท้าย 'วัน'", () => {
    expect(formatMetricValue(45, "days")).toBe("45 วัน");
  });

  it("percent = ทศนิยม 1 + %", () => {
    expect(formatMetricValue(12.345, "percent")).toBe("12.3%");
  });

  it("percent ติดลบใช้ U+2212", () => {
    expect(formatMetricValue(-3.2, "percent")).toBe(`${MINUS}3.2%`);
  });

  it("ระบุทศนิยมเองได้", () => {
    expect(formatMetricValue(1234.5678, "thb", { decimals: 0 })).toBe("1,235 ฿");
  });

  it("ค่าว่าง/NaN → '—' (ห้ามโชว์ NaN ให้ผู้ใช้)", () => {
    expect(formatMetricValue(null, "thb")).toBe("—");
    expect(formatMetricValue(undefined, "count")).toBe("—");
    expect(formatMetricValue(Number.NaN, "thb")).toBe("—");
  });
});

describe("formatDeltaPercent", () => {
  it("เพิ่มขึ้น → +", () => {
    expect(formatDeltaPercent(120, 100)).toBe("+20.0%");
  });

  it("ลดลง → U+2212", () => {
    expect(formatDeltaPercent(80, 100)).toBe(`${MINUS}20.0%`);
  });

  it("ฐาน 0 → null (ห้ามแสดง ∞%)", () => {
    expect(formatDeltaPercent(50, 0)).toBeNull();
  });
});
