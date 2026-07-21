/**
 * payroll-calc.ts — การคำนวณเงินเดือน production (pure functions, ไม่มี RPC)
 *
 * port + ยกระดับจาก prototype fixture `calcWhtMonthly` (admin/prototypes/hrm/_fixtures/payroll.ts).
 * ใช้ที่ API layer (route handler) ตอนสร้าง/คำนวณรอบเงินเดือน + reuse ฝั่ง SSR ได้ (pure, testable).
 *
 * กฎเงิน (binding ตาม spec §4 + Review Log):
 *  - ประกันสังคม (sso): employee_rate% ของ min(base, ceiling_wage=15,000) → เพดาน max 750 บาท/คน
 *  - กองทุนสำรองฯ (pvd): employee_rate% ของ base (ไม่มีเพดาน) — เฉพาะคนที่อยู่ในกองทุน
 *  - ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1): ประมาณการจาก gross รายเดือน × 12, อัตราก้าวหน้าแบบย่อ
 *  - gross − total_deductions = net_pay (ตรวจ balance เสมอ)
 */

import type { Employee, Fund, PayItem, Payslip } from "@/lib/hrm/types";

/** ฐานสะสมภาษีก้าวหน้าต่อขั้น (สูตรที่ถูกต้องใน prototype) */
const WHT_BRACKET = {
  b150: 150000,
  b300: 300000,
  b500: 500000,
  b750: 750000,
} as const;

/**
 * คำนวณประกันสังคมฝั่งใดฝั่งหนึ่ง.
 * @param base เงินเดือนฐาน/รายได้ฐานคำนวณ
 * @param fund row hrm_funds (fund_type='sso') — ใช้ rate + ceiling_wage
 * @param side 'employee' | 'employer'
 * @returns บาท (ปัดเป็นจำนวนเต็ม, เพดานตาม ceiling_wage)
 */
export function calcSso(
  base: number,
  fund: Pick<Fund, "employee_rate" | "employer_rate" | "ceiling_wage">,
  side: "employee" | "employer" = "employee",
): number {
  const safeBase = Math.max(0, Number(base) || 0);
  const ceiling = fund.ceiling_wage ?? 15000;
  const cappedBase = Math.min(safeBase, ceiling);
  const rate = side === "employer" ? fund.employer_rate : fund.employee_rate;
  return Math.round((cappedBase * (Number(rate) || 0)) / 100);
}

/**
 * คำนวณกองทุนสำรองเลี้ยงชีพ (pvd) ฝั่งใดฝั่งหนึ่ง.
 * ไม่มีเพดาน (เว้นแต่ fund.ceiling_wage ถูกตั้งไว้).
 */
export function calcPvd(
  base: number,
  fund: Pick<Fund, "employee_rate" | "employer_rate" | "ceiling_wage">,
  side: "employee" | "employer" = "employee",
): number {
  const safeBase = Math.max(0, Number(base) || 0);
  const effectiveBase =
    fund.ceiling_wage != null ? Math.min(safeBase, fund.ceiling_wage) : safeBase;
  const rate = side === "employer" ? fund.employer_rate : fund.employee_rate;
  return Math.round((effectiveBase * (Number(rate) || 0)) / 100);
}

/**
 * ภาษีหัก ณ ที่จ่ายรายเดือน (ภ.ง.ด.1) — ประมาณการจาก gross/เดือน.
 * ขั้นตอน: รายได้ต่อปี = gross×12 · หักค่าใช้จ่าย 50% ไม่เกิน 100,000 · ลดหย่อนส่วนตัว 60,000
 * อัตราก้าวหน้า (ฐานสะสมต่อขั้น): 0–150k=0% · 150k–300k=5% · 300k–500k=10% · 500k–750k=15% · 750k+=20%
 *   ภาษีสะสมที่เพดานแต่ละขั้น: 300k→7,500 · 500k→27,500 · 750k→65,000
 * port ตรงจาก prototype `calcWhtMonthly`.
 */
export function calcWhtMonthly(grossPerMonth: number): number {
  const gross = Math.max(0, Number(grossPerMonth) || 0);
  const annualGross = gross * 12;
  const expDeduction = Math.min(annualGross * 0.5, 100000);
  const personalDeduction = 60000;
  const taxableIncome = Math.max(annualGross - expDeduction - personalDeduction, 0);

  let annualTax = 0;
  if (taxableIncome > WHT_BRACKET.b750)
    annualTax = (taxableIncome - WHT_BRACKET.b750) * 0.2 + 65000;
  else if (taxableIncome > WHT_BRACKET.b500)
    annualTax = (taxableIncome - WHT_BRACKET.b500) * 0.15 + 27500;
  else if (taxableIncome > WHT_BRACKET.b300)
    annualTax = (taxableIncome - WHT_BRACKET.b300) * 0.1 + 7500;
  else if (taxableIncome > WHT_BRACKET.b150) annualTax = (taxableIncome - WHT_BRACKET.b150) * 0.05;

  return Math.round(annualTax / 12);
}

/** ค่าเข้า computePayslip ต่อพนักงาน (สรุปเวลาจากหน้าเวลา) */
export interface PayInput {
  /** OT ชั่วโมงในรอบ (รวมจาก attendance) */
  otHours?: number;
  /** จำนวนวันขาด (หักเงิน) */
  absenceDays?: number;
  /** จำนวนครั้งมาสาย (ข้อมูลประกอบ ไม่หักเงินอัตโนมัติ) */
  lateCount?: number;
  /** รายการเงินเพิ่มเพิ่มเติม (เบี้ยขยัน/ค่าตำแหน่ง/ฯลฯ) นอกเหนือเงินเดือนฐาน */
  extraEarnings?: Array<{ pay_item_id: string; name: string; amount: number }>;
  /** รายการเงินหักเพิ่มเติม (เงินกู้/ฯลฯ) นอกเหนือ sso/pvd/wht */
  extraDeductions?: Array<{ pay_item_id: string; name: string; amount: number }>;
}

/** จำนวนวันทำงานมาตรฐานต่อเดือน (ใช้หารหาค่าจ้างต่อวัน/OT) */
const WORK_DAYS_PER_MONTH = 22;
const WORK_HOURS_PER_DAY = 8;
const OT_MULTIPLIER = 1.5;

export type PayslipDraft = Omit<Payslip, "id" | "created_at" | "run_id">;

/**
 * คำนวณสลิป 1 ใบจากข้อมูลพนักงาน + กองทุน + สรุปเวลา.
 *
 * - monthly/contract: base = เงินเดือน · OT คิดจาก (base/(22×8))×1.5×ชม. · หักขาด = (base/22)×วันขาด
 * - daily: base_salary = ค่าจ้าง/วัน · ระบบ payroll daily ต้องส่ง `daysWorked` ผ่าน extraEarnings
 *   (route ที่สร้างรอบ daily จะ pre-compute earnings ของ daily แล้วส่งเข้ามาเป็น extraEarnings)
 * - sso/pvd หักเฉพาะคนที่มี ssn (sso) และอยู่ในกองทุน pvd · daily ไม่มี ssn → ไม่หัก
 *
 * @param funds รายการ hrm_funds ของ org (หา sso/pvd)
 * @returns PayslipDraft (ยังไม่มี id/run_id — route ใส่ตอน insert)
 */
export function computePayslip(
  employee: Pick<Employee, "id" | "org_id" | "base_salary" | "employment_type" | "ssn">,
  input: PayInput,
  funds: Fund[],
): PayslipDraft {
  const otHours = Math.max(0, Number(input.otHours) || 0);
  const absenceDays = Math.max(0, Number(input.absenceDays) || 0);
  const lateCount = Math.max(0, Number(input.lateCount) || 0);
  const base = Math.max(0, Number(employee.base_salary) || 0);
  const isDaily = employee.employment_type === "daily";

  // ---- earnings ----
  const earnings: Array<{ pay_item_id: string; name: string; amount: number }> = [];

  // เงินฐาน: monthly/contract = เงินเดือน − หักขาด · daily = ส่งผ่าน extraEarnings (route pre-compute)
  let baseEarning = 0;
  if (!isDaily) {
    const absenceCut = absenceDays > 0 ? Math.round((base / WORK_DAYS_PER_MONTH) * absenceDays) : 0;
    baseEarning = Math.max(0, base - absenceCut);
    earnings.push({ pay_item_id: "BASE", name: "เงินเดือน", amount: baseEarning });
  }

  // OT (monthly/contract เท่านั้น — daily คิดเป็นวันแล้ว)
  let otAmount = 0;
  if (!isDaily && otHours > 0) {
    const hourlyRate = base / (WORK_DAYS_PER_MONTH * WORK_HOURS_PER_DAY);
    otAmount = Math.round(hourlyRate * OT_MULTIPLIER * otHours);
    if (otAmount > 0) earnings.push({ pay_item_id: "OT", name: "ค่าล่วงเวลา", amount: otAmount });
  }

  // เงินเพิ่มเพิ่มเติม (รวมเงินฐาน daily ที่ route pre-compute มาแล้ว)
  for (const e of input.extraEarnings ?? []) {
    if (Number(e.amount) > 0) earnings.push({ ...e, amount: Math.round(Number(e.amount)) });
  }

  const gross = earnings.reduce((s, e) => s + e.amount, 0);

  // ---- deductions ----
  const ssoFund = funds.find((f) => f.fund_type === "sso" && f.active);
  const pvdFund = funds.find((f) => f.fund_type === "pvd" && f.active);

  // sso: เฉพาะคนที่มี ssn (อยู่ในระบบประกันสังคม) · ฐาน = เงินเดือนฐาน (ไม่รวม OT)
  const ssoBase = isDaily ? gross : base;
  const hasSso = !!employee.ssn && !!ssoFund;
  const ssoEmployee = hasSso ? calcSso(ssoBase, ssoFund!, "employee") : 0;
  const ssoEmployer = hasSso ? calcSso(ssoBase, ssoFund!, "employer") : 0;

  // pvd: เฉพาะ monthly/contract ที่มีกองทุน · ฐาน = เงินเดือนฐาน
  const hasPvd = !isDaily && !!pvdFund;
  const pvdEmployee = hasPvd ? calcPvd(base, pvdFund!, "employee") : 0;
  const pvdEmployer = hasPvd ? calcPvd(base, pvdFund!, "employer") : 0;

  // wht: ภ.ง.ด.1 ประมาณการจาก gross รายเดือน (daily ปกติไม่ถึงเกณฑ์ → 0)
  const whtAmount = isDaily ? 0 : calcWhtMonthly(gross);

  const deductions: Array<{ pay_item_id: string; name: string; amount: number }> = [];
  if (ssoEmployee > 0)
    deductions.push({ pay_item_id: "SSO", name: "ประกันสังคม (ลูกจ้าง)", amount: ssoEmployee });
  if (pvdEmployee > 0)
    deductions.push({
      pay_item_id: "PVD",
      name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง)",
      amount: pvdEmployee,
    });
  if (whtAmount > 0)
    deductions.push({ pay_item_id: "WHT", name: "ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)", amount: whtAmount });
  for (const d of input.extraDeductions ?? []) {
    if (Number(d.amount) > 0) deductions.push({ ...d, amount: Math.round(Number(d.amount)) });
  }

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netPay = gross - totalDeductions; // balance: gross − deductions = net

  return {
    org_id: employee.org_id,
    employee_id: employee.id,
    base_salary: base,
    ot_hours: otHours,
    ot_amount: otAmount,
    absence_days: absenceDays,
    late_count: lateCount,
    earnings_json: earnings,
    deductions_json: deductions,
    sso_employee: ssoEmployee,
    sso_employer: ssoEmployer,
    pvd_employee: pvdEmployee,
    pvd_employer: pvdEmployer,
    wht_amount: whtAmount,
    gross,
    total_deductions: totalDeductions,
    net_pay: netPay,
  };
}

/** สรุปยอดรวมของรอบจากสลิปทุกใบ (เขียนลง hrm_payroll_runs) */
export function summarizeRun(slips: PayslipDraft[]): {
  total_earnings: number;
  total_deductions: number;
  total_net: number;
  total_employer_cost: number;
} {
  const total_earnings = slips.reduce((s, p) => s + p.gross, 0);
  const total_deductions = slips.reduce((s, p) => s + p.total_deductions, 0);
  const total_net = slips.reduce((s, p) => s + p.net_pay, 0);
  // ต้นทุนนายจ้าง = gross + ปกส.นายจ้าง + กองทุนนายจ้าง
  const employerSide = slips.reduce((s, p) => s + p.sso_employer + p.pvd_employer, 0);
  const total_employer_cost = total_earnings + employerSide;
  return { total_earnings, total_deductions, total_net, total_employer_cost };
}

/** ค่าเริ่มต้นกองทุน (fallback ถ้า org ยังไม่ตั้ง funds) — sso 5%/5% เพดาน 15,000, pvd 3%/3% */
export const DEFAULT_SSO_RATE = 5;
export const DEFAULT_SSO_CEILING = 15000;
export const DEFAULT_PVD_RATE = 3;
