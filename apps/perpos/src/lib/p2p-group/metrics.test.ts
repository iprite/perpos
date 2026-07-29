/**
 * เทสกฎตัวเลขของโมดูลโฮลดิ้ง — กฎที่ "ผิดแล้วผู้บริหารตัดสินใจผิด"
 * โฟกัส: null ≠ 0 · ฐานประชากรของยอดรวม · การตัดรายการระหว่างกัน · ยอดคงเหลือเงินกู้
 */

import { describe, expect, it } from "vitest";
import {
  consolidate,
  ebit,
  grossProfit,
  groupTotals,
  investmentRoi,
  isEliminated,
  loanOutstanding,
  monthRange,
  monthStart,
  netMargin,
  shareOfProfit,
  sumDefined,
} from "./metrics";
import type { P2pgFinancial, P2pgIntercompany } from "./types";

function fin(over: Partial<P2pgFinancial>): P2pgFinancial {
  return {
    id: "f",
    org_id: "o",
    company_id: "c",
    period_month: "2026-07-01",
    source: "manual",
    revenue: null,
    cogs: null,
    opex: null,
    other_income: null,
    net_profit: null,
    cash_balance: null,
    total_assets: null,
    total_liabilities: null,
    equity: null,
    ar: null,
    ap: null,
    headcount: null,
    is_locked: false,
    note: null,
    ...over,
  };
}

function txn(over: Partial<P2pgIntercompany>): P2pgIntercompany {
  return {
    id: "t",
    org_id: "o",
    txn_date: "2026-07-15",
    from_company_id: "a",
    to_company_id: "b",
    ic_type: "management_fee",
    amount: 0,
    currency: "THB",
    loan_id: null,
    description: null,
    doc_ref: null,
    status: "open",
    settled_date: null,
    counterparty_confirmed: false,
    confirmed_at: null,
    note: null,
    ...over,
  };
}

describe("null ≠ 0", () => {
  it("sumDefined คืน null เมื่อไม่มีค่าเลย (ไม่ใช่ 0)", () => {
    expect(sumDefined([null, undefined])).toBeNull();
    expect(sumDefined([null, 5, undefined, 3])).toBe(8);
  });

  it("grossProfit/ebit เป็น null เมื่อข้อมูลไม่ครบ", () => {
    expect(grossProfit(fin({ revenue: 100 }))).toBeNull();
    expect(grossProfit(fin({ revenue: 100, cogs: 40 }))).toBe(60);
    expect(ebit(fin({ revenue: 100, cogs: 40 }))).toBeNull();
    expect(ebit(fin({ revenue: 100, cogs: 40, opex: 20 }))).toBe(40);
    expect(ebit(fin({ revenue: 100, cogs: 40, opex: 20, other_income: 5 }))).toBe(45);
  });

  it("netMargin ไม่คืน 100% จากฐานศูนย์ (บทเรียน mattii)", () => {
    expect(netMargin(fin({ revenue: 0, net_profit: 500 }))).toBeNull();
    expect(netMargin(fin({ revenue: null, net_profit: 500 }))).toBeNull();
    expect(netMargin(fin({ revenue: 1000, net_profit: 250 }))).toBe(0.25);
  });

  it("investmentRoi คืน null เมื่อยังไม่มีเงินลงทุน", () => {
    expect(investmentRoi(0, 5000)).toBeNull();
    expect(investmentRoi(1_000_000, 120_000)).toBeCloseTo(0.12);
  });
});

describe("ยอดรวมกลุ่มต้องบอกฐานประชากร", () => {
  it("นับเฉพาะบริษัทที่มีข้อมูล และรายงานจำนวนที่ขาด", () => {
    const rows = [fin({ company_id: "a", revenue: 100 }), fin({ company_id: "b", revenue: 200 })];
    const t = groupTotals(rows, 4);
    expect(t.revenue).toBe(300);
    expect(t.counted).toBe(2);
    expect(t.total).toBe(4);
    expect(t.missing).toBe(2);
  });

  it("ไม่มีข้อมูลเลย → ยอดเป็น null ไม่ใช่ 0", () => {
    const t = groupTotals([], 3);
    expect(t.revenue).toBeNull();
    expect(t.netProfit).toBeNull();
    expect(t.missing).toBe(3);
  });
});

describe("การตัดรายการระหว่างกัน", () => {
  it("ตัดเฉพาะรายการที่เป็นรายได้-ค่าใช้จ่ายระหว่างกัน", () => {
    expect(isEliminated(txn({ ic_type: "management_fee" }))).toBe(true);
    expect(isEliminated(txn({ ic_type: "service" }))).toBe(true);
    expect(isEliminated(txn({ ic_type: "goods" }))).toBe(true);
    expect(isEliminated(txn({ ic_type: "interest" }))).toBe(true);
    expect(isEliminated(txn({ ic_type: "dividend" }))).toBe(true);
    // รายการงบดุล — ไม่ใช่รายได้ จึงไม่ตัดจากยอดรายได้
    expect(isEliminated(txn({ ic_type: "loan" }))).toBe(false);
    expect(isEliminated(txn({ ic_type: "loan_repayment" }))).toBe(false);
    expect(isEliminated(txn({ ic_type: "capital" }))).toBe(false);
    expect(isEliminated(txn({ ic_type: "expense_reimburse" }))).toBe(false);
  });

  it("รายการที่ยกเลิกแล้วไม่ถูกนับเป็นรายการตัด", () => {
    expect(isEliminated(txn({ ic_type: "service", status: "cancelled" }))).toBe(false);
  });

  it("งบรวม = ผลบวก − รายการระหว่างกัน และรายงานจำนวนรายการที่ตัด", () => {
    const rows = [
      fin({ company_id: "a", revenue: 1_000_000, net_profit: 200_000 }),
      fin({ company_id: "b", revenue: 500_000, net_profit: 50_000 }),
    ];
    const ic = [
      txn({ ic_type: "management_fee", amount: 120_000 }),
      txn({ ic_type: "loan", amount: 900_000 }), // ไม่ตัด
      txn({ ic_type: "service", amount: 30_000 }),
    ];
    const r = consolidate(rows, ic, 2);
    expect(r.combinedRevenue).toBe(1_500_000);
    expect(r.eliminations).toBe(150_000);
    expect(r.eliminationCount).toBe(2);
    expect(r.consolidatedRevenue).toBe(1_350_000);
    // กำไรรวมไม่เปลี่ยน — รายได้ที่ตัดมีต้นทุนคู่กันในอีกบริษัทอยู่แล้ว
    expect(r.consolidatedNetProfit).toBe(250_000);
  });

  it("ไม่มีข้อมูลงบ → รายได้รวมยังเป็น null แม้มีรายการตัด", () => {
    const r = consolidate([], [txn({ ic_type: "service", amount: 1_000 })], 2);
    expect(r.consolidatedRevenue).toBeNull();
    expect(r.eliminations).toBe(1_000);
  });
});

describe("ยอดคงเหลือเงินกู้", () => {
  it("ยังไม่มีธุรกรรมเบิก → ใช้เงินต้นตามสัญญา", () => {
    expect(loanOutstanding(1_000_000, [])).toBe(1_000_000);
  });

  it("หักเงินที่ชำระคืนแล้ว", () => {
    const txns = [
      txn({ ic_type: "loan", amount: 1_000_000 }),
      txn({ ic_type: "loan_repayment", amount: 300_000 }),
      txn({ ic_type: "interest", amount: 25_000 }), // ดอกเบี้ยไม่ลดเงินต้น
    ];
    expect(loanOutstanding(1_000_000, txns)).toBe(700_000);
  });

  it("ไม่นับธุรกรรมที่ยกเลิก", () => {
    const txns = [
      txn({ ic_type: "loan", amount: 500_000 }),
      txn({ ic_type: "loan_repayment", amount: 200_000, status: "cancelled" }),
    ];
    expect(loanOutstanding(500_000, txns)).toBe(500_000);
  });
});

describe("ส่วนแบ่งกำไร + งวดเดือน", () => {
  it("shareOfProfit ตามสัดส่วนถือหุ้น · null เมื่อขาดข้อมูล", () => {
    expect(shareOfProfit(fin({ net_profit: 1_000_000 }), { ownership_pct: 60 })).toBe(600_000);
    expect(shareOfProfit(fin({ net_profit: 1_000_000 }), { ownership_pct: null })).toBeNull();
    expect(shareOfProfit(fin({ net_profit: null }), { ownership_pct: 60 })).toBeNull();
  });

  it("monthStart/monthRange ครอบคลุมทั้งเดือน (รวมกุมภาพันธ์ปีอธิกสุรทิน)", () => {
    expect(monthStart("2026-07-15")).toBe("2026-07-01");
    expect(monthRange("2026-07-01")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(monthRange("2024-02-01")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange("2026-02-01")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
