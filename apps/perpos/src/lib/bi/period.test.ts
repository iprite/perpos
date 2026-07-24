/**
 * period.test.ts — คุมการแปลงคำเวลาเป็นช่วงวันที่ (contract §11 D2)
 * ผิดช่วงเวลา = ตัวเลขผิดทั้งคำตอบ → ปฏิทิน vs ปีงบประมาณ / prev_period / yoy / เพดาน ต้องมีเทส
 */
import { describe, it, expect } from "vitest";
import {
  resolvePeriod,
  resolveExplicitPeriod,
  comparisonPeriod,
  capPeriod,
  fiscalYearOf,
  periodLine,
} from "./period";

const TODAY = "2026-07-24"; // ศุกร์

describe("resolvePeriod — ปฏิทินเป็นค่าตั้งต้น (D2)", () => {
  it("year = ปีปฏิทิน ม.ค.–ธ.ค.", () => {
    const p = resolvePeriod({ grain: "year", today: TODAY });
    expect([p.from, p.to]).toEqual(["2026-01-01", "2026-12-31"]);
    expect(p.label_th).toContain("2569"); // พ.ศ.
  });

  it("quarter = ไตรมาสปฏิทิน (ก.ค.–ก.ย. = Q3)", () => {
    const p = resolvePeriod({ grain: "quarter", today: TODAY });
    expect([p.from, p.to]).toEqual(["2026-07-01", "2026-09-30"]);
    expect(p.label_th).toContain("ไตรมาส 3");
  });

  it("month = เดือนปัจจุบันเต็มเดือน", () => {
    const p = resolvePeriod({ grain: "month", today: TODAY });
    expect([p.from, p.to]).toEqual(["2026-07-01", "2026-07-31"]);
  });

  it("week = จันทร์–อาทิตย์", () => {
    const p = resolvePeriod({ grain: "week", today: TODAY });
    expect([p.from, p.to]).toEqual(["2026-07-20", "2026-07-26"]);
  });

  it("day = วันเดียว", () => {
    const p = resolvePeriod({ grain: "day", today: TODAY });
    expect([p.from, p.to]).toEqual([TODAY, TODAY]);
  });
});

describe("resolvePeriod — ปีงบประมาณ ต.ค.–ก.ย. (ใช้เมื่อระบุ 'ปีงบประมาณ')", () => {
  it("ก.ค. 2026 อยู่ในปีงบประมาณ 2026 (1 ต.ค. 2025 – 30 ก.ย. 2026)", () => {
    const p = resolvePeriod({ grain: "fiscal_year", today: TODAY });
    expect([p.from, p.to]).toEqual(["2025-10-01", "2026-09-30"]);
    expect(p.label_th).toContain("ปีงบประมาณ 2569");
  });

  it("ต.ค. = ข้ามเข้าไปปีงบประมาณถัดไป", () => {
    expect(fiscalYearOf(new Date(Date.UTC(2026, 9, 1)))).toBe(2027);
    const p = resolvePeriod({ grain: "fiscal_year", today: "2026-10-01" });
    expect([p.from, p.to]).toEqual(["2026-10-01", "2027-09-30"]);
  });

  it("ปีงบประมาณต่างจากปีปฏิทินในช่วง ต.ค.–ธ.ค.", () => {
    const cal = resolvePeriod({ grain: "year", today: "2026-11-15" });
    const fis = resolvePeriod({ grain: "fiscal_year", today: "2026-11-15" });
    expect(cal.from).toBe("2026-01-01");
    expect(fis.from).toBe("2026-10-01");
  });
});

describe("resolvePeriod — offset (ช่วงก่อนหน้า / ข้ามปี)", () => {
  it("month offset -1 ข้ามปีถูกต้อง", () => {
    const p = resolvePeriod({ grain: "month", offset: -1, today: "2026-01-10" });
    expect([p.from, p.to]).toEqual(["2025-12-01", "2025-12-31"]);
  });

  it("quarter offset -1 ข้ามปีถูกต้อง", () => {
    const p = resolvePeriod({ grain: "quarter", offset: -1, today: "2026-02-10" });
    expect([p.from, p.to]).toEqual(["2025-10-01", "2025-12-31"]);
  });

  it("เดือน ก.พ. ปีอธิกสุรทิน สิ้นสุด 29", () => {
    const p = resolvePeriod({ grain: "month", today: "2028-02-05" });
    expect(p.to).toBe("2028-02-29");
  });
});

describe("comparisonPeriod", () => {
  it("prev_period ของเดือน = เดือนก่อน (เต็มเดือน)", () => {
    const p = resolvePeriod({ grain: "month", today: "2026-01-10" });
    const c = comparisonPeriod(p, "prev_period")!;
    expect([c.from, c.to]).toEqual(["2025-12-01", "2025-12-31"]);
  });

  it("yoy = ช่วงเดียวกันของปีก่อน", () => {
    const p = resolvePeriod({ grain: "quarter", today: TODAY });
    const c = comparisonPeriod(p, "yoy")!;
    expect([c.from, c.to]).toEqual(["2025-07-01", "2025-09-30"]);
  });

  it("yoy ของปีงบประมาณ = ปีงบประมาณก่อนหน้า", () => {
    const p = resolvePeriod({ grain: "fiscal_year", today: TODAY });
    const c = comparisonPeriod(p, "yoy")!;
    expect([c.from, c.to]).toEqual(["2024-10-01", "2025-09-30"]);
  });

  it("none / target → ไม่มีช่วงเทียบ (target ยังไม่รองรับ, D5e)", () => {
    const p = resolvePeriod({ grain: "month", today: TODAY });
    expect(comparisonPeriod(p, "none")).toBeNull();
    expect(comparisonPeriod(p, "target")).toBeNull();
  });

  it("ช่วงกำหนดเอง prev_period = ถอยหลังเท่าความยาวช่วงเดิม", () => {
    const p = resolveExplicitPeriod("2026-03-01", "2026-03-10");
    const c = comparisonPeriod(p, "prev_period")!;
    expect([c.from, c.to]).toEqual(["2026-02-19", "2026-02-28"]);
  });
});

describe("เพดานช่วงเวลา (max_period_months)", () => {
  it("ช่วงยาวเกินเพดาน → ตัด + ติดธง capped + บอกผู้ใช้ใน label", () => {
    const p = resolveExplicitPeriod("2016-01-01", "2026-07-24", 36);
    expect(p.capped).toBe(true);
    expect(p.from).toBe("2023-07-25");
    expect(p.label_th).toContain("เพดาน 36 เดือน");
  });

  it("ช่วงไม่เกินเพดาน → ไม่ตัด", () => {
    const p = resolvePeriod({ grain: "year", today: TODAY, maxPeriodMonths: 36 });
    expect(p.capped).toBe(false);
    expect(p.from).toBe("2026-01-01");
  });

  it("ไม่ระบุเพดาน → ไม่ตัด", () => {
    const p = capPeriod(resolveExplicitPeriod("2000-01-01", "2026-01-01"), undefined);
    expect(p.capped).toBe(false);
  });
});

describe("periodLine — คำตอบต้องบอกช่วงวันที่ที่ใช้เสมอ (D2)", () => {
  it("มีทั้ง label และช่วงวันที่จริง", () => {
    const p = resolvePeriod({ grain: "month", today: TODAY });
    const line = periodLine(p);
    expect(line).toContain("ช่วงเวลา:");
    expect(line).toContain("1 ก.ค. 2569");
    expect(line).toContain("31 ก.ค. 2569");
  });

  it("มีช่วงเทียบ → ต่อท้ายว่าเทียบกับอะไร", () => {
    const p = resolvePeriod({ grain: "month", today: TODAY });
    const line = periodLine(p, comparisonPeriod(p, "yoy"));
    expect(line).toContain("เทียบกับ");
  });
});
