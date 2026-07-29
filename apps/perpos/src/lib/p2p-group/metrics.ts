/**
 * p2p_group — สูตร/ตัวเลขของโมดูลโฮลดิ้ง **แหล่งเดียวของทั้งโมดูล**
 * contract §6 — ห้ามหน้าไหนคำนวณเอง (บทเรียน mattii/bi: สูตรกระจาย → เลขขัดกัน)
 *
 * หลักที่ห้ามพัง:
 *  1. `null` = ยังไม่มีข้อมูล ≠ 0 → ผลลัพธ์เป็น null ไม่ใช่ 0
 *  2. ทุกยอดรวมคืน `counted`/`total` มาด้วยเสมอ (บอกฐานประชากร)
 *  3. อัตราส่วนที่ตัวหารเป็น 0/null → คืน null (ห้ามคืน 100%)
 */

import type { P2pgCompany, P2pgFinancial, P2pgIntercompany } from "./types";

/** บวกเฉพาะค่าที่ไม่ใช่ null — ถ้าไม่มีค่าเลยคืน null (ไม่ใช่ 0) */
export function sumDefined(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/** กำไรขั้นต้น = รายได้ − ต้นทุนขาย (null ถ้าขาดข้างใดข้างหนึ่ง) */
export function grossProfit(f: Pick<P2pgFinancial, "revenue" | "cogs">): number | null {
  if (f.revenue == null || f.cogs == null) return null;
  return f.revenue - f.cogs;
}

/** กำไรจากการดำเนินงาน = รายได้ − ต้นทุนขาย − ค่าใช้จ่าย + รายได้อื่น */
export function ebit(
  f: Pick<P2pgFinancial, "revenue" | "cogs" | "opex" | "other_income">,
): number | null {
  if (f.revenue == null || f.cogs == null || f.opex == null) return null;
  return f.revenue - f.cogs - f.opex + (f.other_income ?? 0);
}

/** อัตรากำไรสุทธิ — null เมื่อไม่มีรายได้ (ห้ามคืน 100% จากฐาน 0) */
export function netMargin(f: Pick<P2pgFinancial, "revenue" | "net_profit">): number | null {
  if (f.revenue == null || f.net_profit == null || f.revenue === 0) return null;
  return f.net_profit / f.revenue;
}

/** ส่วนแบ่งกำไรตามสัดส่วนการถือหุ้น (มุมของโฮลดิ้ง) */
export function shareOfProfit(
  f: Pick<P2pgFinancial, "net_profit">,
  company: Pick<P2pgCompany, "ownership_pct">,
): number | null {
  if (f.net_profit == null || company.ownership_pct == null) return null;
  return (f.net_profit * company.ownership_pct) / 100;
}

export interface GroupTotals {
  revenue: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  cash: number | null;
  headcount: number | null;
  /** จำนวนบริษัทที่มีข้อมูลงบเดือนนั้น */
  counted: number;
  /** จำนวนบริษัททั้งหมดที่ควรมี */
  total: number;
  /** จำนวนบริษัทที่ยังไม่มีข้อมูล — UI ต้องแสดงเสมอ */
  missing: number;
}

/**
 * ยอดรวมทั้งกลุ่มของเดือนหนึ่ง — คืนฐานประชากรมาด้วยเสมอ
 * `total` = จำนวนบริษัทที่นับ (ไม่รวมโฮลดิ้งเองก็ได้ ให้ผู้เรียกกรองมาก่อน)
 */
export function groupTotals(rows: P2pgFinancial[], totalCompanies: number): GroupTotals {
  const counted = rows.length;
  return {
    revenue: sumDefined(rows.map((r) => r.revenue)),
    grossProfit: sumDefined(rows.map((r) => grossProfit(r))),
    netProfit: sumDefined(rows.map((r) => r.net_profit)),
    cash: sumDefined(rows.map((r) => r.cash_balance)),
    headcount: sumDefined(rows.map((r) => r.headcount)),
    counted,
    total: totalCompanies,
    missing: Math.max(0, totalCompanies - counted),
  };
}

/**
 * รายการระหว่างบริษัทที่ต้อง "ตัด" ตอนทำงบรวม —
 * รายจ่ายฝั่งหนึ่งคือรายได้อีกฝั่งหนึ่ง จึงหักออกจากยอดรวมของกลุ่ม
 *
 * ชนิดที่ตัด: ค่าบริหารจัดการ · ค่าบริการ · ขายสินค้าระหว่างกัน · ดอกเบี้ย · เงินปันผลระหว่างกัน
 * ชนิดที่ **ไม่ตัด** จากรายได้: เงินต้นกู้/คืนกู้/เพิ่มทุน/คืนเงินสำรองจ่าย (เป็นรายการงบดุล ไม่ใช่รายได้)
 */
export const ELIMINATED_IC_TYPES = [
  "management_fee",
  "service",
  "goods",
  "interest",
  "dividend",
] as const;

export function isEliminated(txn: Pick<P2pgIntercompany, "ic_type" | "status">): boolean {
  if (txn.status === "cancelled") return false;
  return (ELIMINATED_IC_TYPES as readonly string[]).includes(txn.ic_type);
}

export interface ConsolidatedResult {
  /** ผลรวมดิบก่อนตัดรายการระหว่างกัน */
  combinedRevenue: number | null;
  combinedNetProfit: number | null;
  /** ยอดรายการระหว่างกันที่ตัดออก (บวกเสมอ) */
  eliminations: number;
  /** จำนวนรายการที่ตัด */
  eliminationCount: number;
  /** หลังตัด */
  consolidatedRevenue: number | null;
  consolidatedNetProfit: number | null;
  counted: number;
  total: number;
  missing: number;
}

/**
 * งบรวมแบบบริหาร: รวมทุกบริษัท แล้วหักรายการระหว่างกันของเดือนนั้น
 * **ไม่ใช่งบการเงินรวมตามมาตรฐานการบัญชี** (ไม่มี NCI/goodwill) — UI ต้องระบุให้ชัด
 */
export function consolidate(
  rows: P2pgFinancial[],
  intercompany: P2pgIntercompany[],
  totalCompanies: number,
): ConsolidatedResult {
  const totals = groupTotals(rows, totalCompanies);
  const elim = intercompany.filter(isEliminated);
  const eliminations = elim.reduce((a, t) => a + (t.amount ?? 0), 0);

  return {
    combinedRevenue: totals.revenue,
    combinedNetProfit: totals.netProfit,
    eliminations,
    eliminationCount: elim.length,
    consolidatedRevenue: totals.revenue == null ? null : totals.revenue - eliminations,
    // กำไรสุทธิ: รายได้ที่ตัดออกไปมีต้นทุนคู่กันอยู่แล้วในอีกบริษัท → กำไรรวมไม่เปลี่ยน
    consolidatedNetProfit: totals.netProfit,
    counted: totals.counted,
    total: totals.total,
    missing: totals.missing,
  };
}

/** ยอดคงเหลือเงินกู้ = เงินต้นที่เบิก − เงินที่คืน (จากธุรกรรมที่ผูกสัญญาไว้) */
export function loanOutstanding(
  principal: number,
  txns: Pick<P2pgIntercompany, "ic_type" | "amount" | "status">[],
): number {
  let drawn = 0;
  let repaid = 0;
  for (const t of txns) {
    if (t.status === "cancelled") continue;
    if (t.ic_type === "loan") drawn += t.amount ?? 0;
    if (t.ic_type === "loan_repayment") repaid += t.amount ?? 0;
  }
  // ถ้ายังไม่มีธุรกรรมเบิกเลย ให้ถือเงินต้นตามสัญญาเป็นยอดตั้งต้น
  const base = drawn > 0 ? drawn : principal;
  return base - repaid;
}

/** ผลตอบแทนเงินลงทุน = ปันผลรับสะสม / เงินลงทุนสะสม (null เมื่อยังไม่ลงทุน) */
export function investmentRoi(totalCost: number, totalDividendReceived: number): number | null {
  if (!totalCost) return null;
  return totalDividendReceived / totalCost;
}

/** วันที่ 1 ของเดือนในรูป ISO (ใช้เป็น period_month) */
export function monthStart(d: Date | string): string {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00`) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** ช่วงวันของเดือน (ต้นเดือน–สิ้นเดือน) สำหรับ query */
export function monthRange(periodMonth: string): { from: string; to: string } {
  const [y, m] = periodMonth.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${periodMonth.slice(0, 7)}-01`, to: `${periodMonth.slice(0, 7)}-${last}` };
}
