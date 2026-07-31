import { describe, it, expect } from "vitest";
import {
  CABLE_SCRAP_THRESHOLD_M,
  applyScrapUsage,
  isScrapLength,
  nextScrapCode,
  parseCableLength,
} from "./cable";
import { movementWarehouseRule, serialSourceFilter } from "./stock-movements";

describe("parseCableLength — ปล่อยว่าง = ไม่ได้ระบุ ไม่ใช่ 0", () => {
  it("ค่าว่าง/ไม่ส่งมา → null", () => {
    expect(parseCableLength("")).toEqual({ ok: true, value: null });
    expect(parseCableLength("   ")).toEqual({ ok: true, value: null });
    expect(parseCableLength(null)).toEqual({ ok: true, value: null });
    expect(parseCableLength(undefined)).toEqual({ ok: true, value: null });
  });

  it("ตัวเลขปกติ → ปัดสองตำแหน่ง", () => {
    expect(parseCableLength("12.345")).toEqual({ ok: true, value: 12.35 });
    expect(parseCableLength(0)).toEqual({ ok: true, value: 0 });
  });

  it("กรอกมั่ว/ติดลบ → error ไม่กลืนเงียบ", () => {
    expect(parseCableLength("abc").ok).toBe(false);
    expect(parseCableLength(-1).ok).toBe(false);
  });
});

describe("isScrapLength — บั๊กเดิม Number('') = 0 < 5 ทำให้ม้วนเต็มติดธงเศษ", () => {
  it("ไม่ได้ระบุความยาว = ไม่ใช่เศษ", () => {
    expect(isScrapLength(null)).toBe(false);
    // เดิม: is_scrap = Number("") < 5 → true (ผิด)
    const parsed = parseCableLength("");
    expect(parsed.ok && isScrapLength(parsed.value)).toBe(false);
  });

  it("สั้นกว่าเกณฑ์ = เศษสั้น · ยาวกว่า/เท่ากับ = ยังใช้ได้", () => {
    expect(isScrapLength(4.9)).toBe(true);
    expect(isScrapLength(CABLE_SCRAP_THRESHOLD_M)).toBe(false);
    expect(isScrapLength(100)).toBe(false);
  });

  it("ใช้หมดแล้ว (0) ไม่ใช่เศษสั้น", () => {
    expect(isScrapLength(0)).toBe(false);
  });
});

describe("nextScrapCode — ระบบออกรหัสเศษให้เอง", () => {
  it("เริ่มที่ 0001 และนับต่อจากเลขสูงสุดเดิม", () => {
    expect(nextScrapCode("THW-2.5", [])).toBe("SCR-THW-2.5-0001");
    expect(nextScrapCode("THW-2.5", ["SCR-THW-2.5-0001", "SCR-THW-2.5-0007"])).toBe(
      "SCR-THW-2.5-0008",
    );
  });

  it("ไม่สนใจรหัสของวัสดุอื่น/รหัสที่คนตั้งเอง", () => {
    expect(nextScrapCode("A", ["SCR-B-0009", "ของเก่า"])).toBe("SCR-A-0001");
  });
});

describe("applyScrapUsage — หยิบเศษมาใช้", () => {
  it("ตัดความยาวออกแล้วยังเหลือ", () => {
    expect(applyScrapUsage(20, 8)).toEqual({
      ok: true,
      lengthRemaining: 12,
      status: "in_stock",
      isScrap: false,
    });
  });

  it("เหลือน้อยกว่าเกณฑ์ = ติดธงเศษสั้น", () => {
    expect(applyScrapUsage(20, 17)).toEqual({
      ok: true,
      lengthRemaining: 3,
      status: "in_stock",
      isScrap: true,
    });
  });

  it("ใช้หมดพอดี = ปิดเส้นนั้น", () => {
    expect(applyScrapUsage(12.5, 12.5)).toEqual({
      ok: true,
      lengthRemaining: 0,
      status: "issued",
      isScrap: false,
    });
  });

  it("ใช้เกินที่เหลือ / เส้นที่ใช้หมดแล้ว = error", () => {
    expect(applyScrapUsage(5, 6).ok).toBe(false);
    expect(applyScrapUsage(0, 1).ok).toBe(false);
    expect(applyScrapUsage(null, 1).ok).toBe(false);
    expect(applyScrapUsage(5, 0).ok).toBe(false);
  });
});

describe("movementWarehouseRule — คืนของมาจากหน้างาน ไม่ใช่จากคลัง", () => {
  it("รับเข้า = มีแต่ปลายทาง", () => {
    expect(movementWarehouseRule("receive")).toEqual({ source: false, destination: true });
  });

  it("โอนย้าย = ทั้งต้นทางและปลายทาง", () => {
    expect(movementWarehouseRule("transfer")).toEqual({ source: true, destination: true });
  });

  it("เบิก = มีแต่ต้นทาง", () => {
    expect(movementWarehouseRule("issue")).toEqual({ source: true, destination: false });
  });

  it("คืน = มีแต่ปลายทาง (ต้นทางคือหน้างาน ไม่ใช่คลัง — ของถูกหักไปแล้วตอนเบิก)", () => {
    expect(movementWarehouseRule("return")).toEqual({ source: false, destination: true });
  });
});

describe("serialSourceFilter — หา serial ให้ตรงกับสถานะจริง", () => {
  it("โอน/เบิก = ของที่ยังอยู่ในคลังต้นทาง", () => {
    expect(serialSourceFilter("transfer", "wh-1")).toEqual({
      status: "in_stock",
      warehouseId: "wh-1",
    });
    expect(serialSourceFilter("issue", "wh-1")).toEqual({
      status: "in_stock",
      warehouseId: "wh-1",
    });
  });

  it("คืน = ของที่ถูกเบิกออกไปแล้ว (ไม่ผูกคลัง) — เดิมหาจาก in_stock จึงไม่มีวันเจอ", () => {
    expect(serialSourceFilter("return", null)).toEqual({ status: "issued", warehouseId: null });
  });

  it("รับเข้า = ไม่มีของเดิมให้หา", () => {
    expect(serialSourceFilter("receive", null)).toBeNull();
  });
});
