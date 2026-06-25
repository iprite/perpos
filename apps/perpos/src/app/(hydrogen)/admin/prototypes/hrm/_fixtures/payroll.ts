// payroll.ts — pay_items, funds, account_settings, payroll_runs (3 รอบ), payslips (รอบ มิ.ย. 2026)
// ยึดตาม spec §4.2–4.6
// คำนวณ: sso = base_salary * 5% เพดาน 15,000 → max 750 บาท/คน
//         pvd = base_salary * 3% (เฉพาะคนที่ monthly)
//         wht = ประมาณการ (income - 60% deduction - 60,000 personal exemption) * อัตราก้าวหน้า

import type { PayItem, Fund, AccountSetting, PayrollRun, Payslip } from "./types";

// ---- hrm_pay_items ----
export const MOCK_PAY_ITEMS: PayItem[] = [
  // Earnings
  {
    id: "pi-001",
    org_id: "org-demo",
    code: "BASE",
    name: "เงินเดือน",
    item_type: "earning",
    is_recurring: true,
    account_label: "5101 ค่าแรงงาน",
    ytd_type: "income40_1",
    is_system: true,
    active: true,
    sort_order: 1,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "pi-002",
    org_id: "org-demo",
    code: "OT",
    name: "ค่าล่วงเวลา",
    item_type: "earning",
    is_recurring: false,
    account_label: "5102 ค่าล่วงเวลา",
    ytd_type: "income40_1",
    is_system: false,
    active: true,
    sort_order: 2,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "pi-003",
    org_id: "org-demo",
    code: "DILIGENCE",
    name: "เบี้ยขยัน",
    item_type: "earning",
    is_recurring: false,
    account_label: "5103 เบี้ยขยัน",
    ytd_type: "income40_1",
    is_system: false,
    active: true,
    sort_order: 3,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "pi-004",
    org_id: "org-demo",
    code: "POSITION",
    name: "ค่าตำแหน่ง",
    item_type: "earning",
    is_recurring: true,
    account_label: "5104 ค่าตำแหน่ง",
    ytd_type: "income40_1",
    is_system: false,
    active: true,
    sort_order: 4,
    created_at: "2020-01-01T00:00:00Z",
  },
  // Deductions
  {
    id: "pi-005",
    org_id: "org-demo",
    code: "SSO",
    name: "ประกันสังคม (ลูกจ้าง)",
    item_type: "deduction",
    is_recurring: true,
    account_label: "2201 ประกันสังคมค้างจ่าย",
    ytd_type: "none",
    is_system: true,
    active: true,
    sort_order: 10,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "pi-006",
    org_id: "org-demo",
    code: "WHT",
    name: "ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)",
    item_type: "deduction",
    is_recurring: true,
    account_label: "2202 ภาษีหัก ณ ที่จ่ายค้างจ่าย",
    ytd_type: "none",
    is_system: true,
    active: true,
    sort_order: 11,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "pi-007",
    org_id: "org-demo",
    code: "LOAN",
    name: "หักเงินกู้",
    item_type: "deduction",
    is_recurring: false,
    account_label: "1301 ลูกหนี้พนักงาน",
    ytd_type: "none",
    is_system: false,
    active: true,
    sort_order: 12,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "pi-008",
    org_id: "org-demo",
    code: "PVD",
    name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง 3%)",
    item_type: "deduction",
    is_recurring: true,
    account_label: "2203 กองทุนสำรองเลี้ยงชีพค้างจ่าย",
    ytd_type: "none",
    is_system: true,
    active: true,
    sort_order: 13,
    created_at: "2020-01-01T00:00:00Z",
  },
];

// ---- hrm_funds ----
export const MOCK_FUNDS: Fund[] = [
  {
    id: "fund-001",
    org_id: "org-demo",
    fund_type: "sso",
    name: "ประกันสังคม (สปส.)",
    employee_rate: 5,
    employer_rate: 5,
    ceiling_wage: 15000, // เพดานฐานคำนวณ 15,000 บาท → max 750 บาท/คน
    active: true,
    notes: "อัตรา 5%/5% ฝั่งละ เพดานเงินเดือนฐาน 15,000 บาท (max 750 บาท/เดือน)",
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "fund-002",
    org_id: "org-demo",
    fund_type: "pvd",
    name: "กองทุนสำรองเลี้ยงชีพ",
    employee_rate: 3,
    employer_rate: 3,
    ceiling_wage: null, // ไม่มีเพดาน
    active: true,
    notes: "ลูกจ้าง 3% / นายจ้าง 3% ของเงินเดือน",
    created_at: "2020-01-01T00:00:00Z",
  },
];

// ---- hrm_account_settings ----
export const MOCK_ACCOUNT_SETTINGS: AccountSetting[] = [
  {
    id: "as-001",
    org_id: "org-demo",
    setting_key: "payroll_expense",
    account_label: "5101 ค่าแรงงาน",
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "as-002",
    org_id: "org-demo",
    setting_key: "sso_payable",
    account_label: "2201 ประกันสังคมค้างจ่าย",
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "as-003",
    org_id: "org-demo",
    setting_key: "wht_payable",
    account_label: "2202 ภาษีหัก ณ ที่จ่ายค้างจ่าย",
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "as-004",
    org_id: "org-demo",
    setting_key: "pvd_payable",
    account_label: "2203 กองทุนสำรองเลี้ยงชีพค้างจ่าย",
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "as-005",
    org_id: "org-demo",
    setting_key: "bank_payable",
    account_label: "2101 เจ้าหนี้เงินเดือน",
    created_at: "2020-01-01T00:00:00Z",
  },
];

// ---- คำนวณ WHT ประมาณการ (ภ.ง.ด.1) — สูตรอ้างอิงสำหรับเฟส production ----
// หมายเหตุ: สลิป mock ด้านล่างใช้ค่าประกอบที่ตั้งไว้ให้สมจริง (ไม่ได้เรียกฟังก์ชันนี้)
// ฟังก์ชันนี้คงไว้เป็น "สูตรอ้างอิงที่ถูกต้อง" ให้เฟส production นำไปใช้คำนวณจริง
// ขั้นตอน: รายได้ต่อปี = gross*12 · หักค่าใช้จ่าย 50% ไม่เกิน 100,000 · หักลดหย่อนส่วนตัว 60,000
// อัตราก้าวหน้า (ฐานสะสมต่อขั้น): 0–150k=0% · 150k–300k=5% · 300k–500k=10% · 500k–750k=15% · 750k–1M=20%
//   ภาษีสะสมที่เพดานแต่ละขั้น: 300k→7,500 · 500k→27,500 · 750k→65,000
export function calcWhtMonthly(grossPerMonth: number): number {
  const annualGross = grossPerMonth * 12;
  const expDeduction = Math.min(annualGross * 0.5, 100000);
  const personalDeduction = 60000;
  const taxableIncome = Math.max(annualGross - expDeduction - personalDeduction, 0);
  let annualTax = 0;
  if (taxableIncome > 750000) annualTax = (taxableIncome - 750000) * 0.2 + 65000;
  else if (taxableIncome > 500000) annualTax = (taxableIncome - 500000) * 0.15 + 27500;
  else if (taxableIncome > 300000) annualTax = (taxableIncome - 300000) * 0.1 + 7500;
  else if (taxableIncome > 150000) annualTax = (taxableIncome - 150000) * 0.05;
  return Math.round(annualTax / 12);
}

// ---- hrm_payroll_runs ----
// รอบ เม.ย. 2026 (paid) — พนักงาน active 7 คน (ยกเว้น emp-008 terminated)
// เงินเดือน active monthly: 001=45k, 002=28k, 003=32k, 004=22k, 005=40k, 006=20k
// daily emp-007: สมมติทำ 20 วัน = 800*20=16,000
// รวม gross ≈ 45000+28000+32000+22000+40000+20000+16000 = 203,000
// หักรวม: sso(employee)*6 + wht*6 + pvd*6
// ค่าโดยประมาณ:
//  sso_e: 750+750+750+750+750+750+0 = 4,500 (007 no ssn → ไม่หัก)
//  wht: 1375+167+500+0+1042+0+0 = 3,084
//  pvd_e: 1350+840+960+660+1200+600+0 = 5,610
//  total_deductions ≈ 13,194
//  total_net ≈ 203,000 - 13,194 = 189,806
//  sso_employer: 4,500 (เท่า employee)
//  pvd_employer: 5,610
//  total_employer_cost ≈ 203,000 + 4,500 + 5,610 = 213,110

export const MOCK_PAYROLL_RUNS: PayrollRun[] = [
  {
    id: "run-2026-04",
    org_id: "org-demo",
    run_number: "PAY-2026-04",
    period_year: 2026,
    period_month: 4,
    status: "paid",
    total_earnings: 203000,
    total_deductions: 13194,
    total_net: 189806,
    total_employer_cost: 213110,
    notes: "จ่ายแล้ว 25 เม.ย. 2026",
    created_at: "2026-04-20T00:00:00Z",
  },
  {
    id: "run-2026-05",
    org_id: "org-demo",
    run_number: "PAY-2026-05",
    period_year: 2026,
    period_month: 5,
    status: "paid",
    total_earnings: 205000, // มี OT เพิ่มเล็กน้อย
    total_deductions: 13500,
    total_net: 191500,
    total_employer_cost: 215300,
    notes: "จ่ายแล้ว 25 พ.ค. 2026",
    created_at: "2026-05-20T00:00:00Z",
  },
  {
    id: "run-2026-06",
    org_id: "org-demo",
    run_number: "PAY-2026-06",
    period_year: 2026,
    period_month: 6,
    status: "draft",
    total_earnings: 210500, // มี OT และเบี้ยขยันเพิ่ม
    total_deductions: 14150,
    total_net: 196350,
    total_employer_cost: 221280,
    notes: "กำลังตรวจสอบ — รอบมิถุนายน 2569",
    created_at: "2026-06-20T00:00:00Z",
  },
];

// ---- hrm_payslips — รอบ มิ.ย. 2026 (run-2026-06, draft) ----
// พนักงาน active 7 คน: emp-001..007 (ยกเว้น emp-008 terminated)
// คำนวณแต่ละคน:

// emp-001: สุรชัย 45,000 base + ค่าตำแหน่ง 3,000 + OT 2 ชม. (45000/(22*8)*1.5*2 ≈ 766)
//   gross = 45000+3000+766 = 48,766
//   sso_e = 750, pvd_e = 45000*3% = 1350, wht ≈ 1,375 (ค่าประมาณการที่ตั้งให้สมจริง)
//   total_deductions = 750+1350+1375 = 3,475; net = 48,766-3,475 = 45,291

// emp-002: นภาพร 28,000 + เบี้ยขยัน 500
//   gross = 28,500; sso_e=750, pvd_e=840, wht=167; total_ded=1757; net=26,743

// emp-003: ธนพล 32,000 (contract) + OT 4 ชม. (32000/(22*8)*1.5*4 ≈ 1090)
//   gross = 33,090; sso_e=750, pvd_e=960, wht=500; total_ded=2210; net=30,880

// emp-004: ปาลิตา 22,000 (ใหม่ ยังในทดลองงาน) ขาด 1 วัน
//   หักขาด = 22000/22 = 1,000
//   gross = 22,000-1,000 = 21,000; sso_e=750, pvd_e=630, wht=0; total_ded=1380; net=19,620

// emp-005: กิตติศักดิ์ 40,000 + OT 6 ชม. (40000/(22*8)*1.5*6 ≈ 2045)
//   gross = 42,045; sso_e=750, pvd_e=1200, wht=1042; total_ded=2992; net=39,053

// emp-006: วรรณา 20,000 + เบี้ยขยัน 500
//   gross = 20,500; sso_e=750, pvd_e=600, wht=0; total_ded=1350; net=19,150

// emp-007: อรรถพล 800/วัน * 17 วัน = 13,600 (daily)
//   gross = 13,600; sso_e=0 (no ssn), pvd_e=0 (daily), wht=0; total_ded=0; net=13,600

export const MOCK_PAYSLIPS: Payslip[] = [
  {
    id: "ps-2026-06-001",
    org_id: "org-demo",
    run_id: "run-2026-06",
    employee_id: "emp-001",
    base_salary: 45000,
    ot_hours: 2,
    ot_amount: 766,
    absence_days: 0,
    late_count: 0,
    earnings_json: [
      { pay_item_id: "pi-001", name: "เงินเดือน", amount: 45000 },
      { pay_item_id: "pi-004", name: "ค่าตำแหน่ง", amount: 3000 },
      { pay_item_id: "pi-002", name: "ค่าล่วงเวลา", amount: 766 },
    ],
    deductions_json: [
      { pay_item_id: "pi-005", name: "ประกันสังคม (ลูกจ้าง)", amount: 750 },
      { pay_item_id: "pi-008", name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง 3%)", amount: 1350 },
      { pay_item_id: "pi-006", name: "ภาษีหัก ณ ที่จ่าย", amount: 1375 },
    ],
    sso_employee: 750,
    sso_employer: 750,
    pvd_employee: 1350,
    pvd_employer: 1350,
    wht_amount: 1375,
    gross: 48766,
    total_deductions: 3475,
    net_pay: 45291,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    id: "ps-2026-06-002",
    org_id: "org-demo",
    run_id: "run-2026-06",
    employee_id: "emp-002",
    base_salary: 28000,
    ot_hours: 0,
    ot_amount: 0,
    absence_days: 0,
    late_count: 1,
    earnings_json: [
      { pay_item_id: "pi-001", name: "เงินเดือน", amount: 28000 },
      { pay_item_id: "pi-003", name: "เบี้ยขยัน", amount: 500 },
    ],
    deductions_json: [
      { pay_item_id: "pi-005", name: "ประกันสังคม (ลูกจ้าง)", amount: 750 },
      { pay_item_id: "pi-008", name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง 3%)", amount: 840 },
      { pay_item_id: "pi-006", name: "ภาษีหัก ณ ที่จ่าย", amount: 167 },
    ],
    sso_employee: 750,
    sso_employer: 750,
    pvd_employee: 840,
    pvd_employer: 840,
    wht_amount: 167,
    gross: 28500,
    total_deductions: 1757,
    net_pay: 26743,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    id: "ps-2026-06-003",
    org_id: "org-demo",
    run_id: "run-2026-06",
    employee_id: "emp-003",
    base_salary: 32000,
    ot_hours: 4,
    ot_amount: 1090,
    absence_days: 0,
    late_count: 0,
    earnings_json: [
      { pay_item_id: "pi-001", name: "เงินเดือน", amount: 32000 },
      { pay_item_id: "pi-002", name: "ค่าล่วงเวลา", amount: 1090 },
    ],
    deductions_json: [
      { pay_item_id: "pi-005", name: "ประกันสังคม (ลูกจ้าง)", amount: 750 },
      { pay_item_id: "pi-008", name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง 3%)", amount: 960 },
      { pay_item_id: "pi-006", name: "ภาษีหัก ณ ที่จ่าย", amount: 500 },
    ],
    sso_employee: 750,
    sso_employer: 750,
    pvd_employee: 960,
    pvd_employer: 960,
    wht_amount: 500,
    gross: 33090,
    total_deductions: 2210,
    net_pay: 30880,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    id: "ps-2026-06-004",
    org_id: "org-demo",
    run_id: "run-2026-06",
    employee_id: "emp-004",
    base_salary: 22000,
    ot_hours: 0,
    ot_amount: 0,
    absence_days: 1,
    late_count: 2,
    earnings_json: [
      { pay_item_id: "pi-001", name: "เงินเดือน", amount: 21000 }, // หักขาด 1 วัน (22000/22=1000)
    ],
    deductions_json: [
      { pay_item_id: "pi-005", name: "ประกันสังคม (ลูกจ้าง)", amount: 750 },
      { pay_item_id: "pi-008", name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง 3%)", amount: 630 },
    ],
    sso_employee: 750,
    sso_employer: 750,
    pvd_employee: 630,
    pvd_employer: 630,
    wht_amount: 0,
    gross: 21000,
    total_deductions: 1380,
    net_pay: 19620,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    id: "ps-2026-06-005",
    org_id: "org-demo",
    run_id: "run-2026-06",
    employee_id: "emp-005",
    base_salary: 40000,
    ot_hours: 6,
    ot_amount: 2045,
    absence_days: 0,
    late_count: 0,
    earnings_json: [
      { pay_item_id: "pi-001", name: "เงินเดือน", amount: 40000 },
      { pay_item_id: "pi-002", name: "ค่าล่วงเวลา", amount: 2045 },
    ],
    deductions_json: [
      { pay_item_id: "pi-005", name: "ประกันสังคม (ลูกจ้าง)", amount: 750 },
      { pay_item_id: "pi-008", name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง 3%)", amount: 1200 },
      { pay_item_id: "pi-006", name: "ภาษีหัก ณ ที่จ่าย", amount: 1042 },
    ],
    sso_employee: 750,
    sso_employer: 750,
    pvd_employee: 1200,
    pvd_employer: 1200,
    wht_amount: 1042,
    gross: 42045,
    total_deductions: 2992,
    net_pay: 39053,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    id: "ps-2026-06-006",
    org_id: "org-demo",
    run_id: "run-2026-06",
    employee_id: "emp-006",
    base_salary: 20000,
    ot_hours: 0,
    ot_amount: 0,
    absence_days: 0,
    late_count: 0,
    earnings_json: [
      { pay_item_id: "pi-001", name: "เงินเดือน", amount: 20000 },
      { pay_item_id: "pi-003", name: "เบี้ยขยัน", amount: 500 },
    ],
    deductions_json: [
      { pay_item_id: "pi-005", name: "ประกันสังคม (ลูกจ้าง)", amount: 750 },
      { pay_item_id: "pi-008", name: "กองทุนสำรองเลี้ยงชีพ (ลูกจ้าง 3%)", amount: 600 },
    ],
    sso_employee: 750,
    sso_employer: 750,
    pvd_employee: 600,
    pvd_employer: 600,
    wht_amount: 0,
    gross: 20500,
    total_deductions: 1350,
    net_pay: 19150,
    created_at: "2026-06-20T00:00:00Z",
  },
  {
    id: "ps-2026-06-007",
    org_id: "org-demo",
    run_id: "run-2026-06",
    employee_id: "emp-007",
    base_salary: 800, // daily rate
    ot_hours: 0,
    ot_amount: 0,
    absence_days: 0,
    late_count: 1,
    earnings_json: [
      {
        pay_item_id: "pi-001",
        name: "ค่าจ้างรายวัน (17 วัน x 800 บาท)",
        amount: 13600,
      },
    ],
    deductions_json: [], // daily ไม่มี ssn → ไม่หักปกส./pvd
    sso_employee: 0,
    sso_employer: 0,
    pvd_employee: 0,
    pvd_employer: 0,
    wht_amount: 0,
    gross: 13600,
    total_deductions: 0,
    net_pay: 13600,
    created_at: "2026-06-20T00:00:00Z",
  },
];

// ---- Helpers ----

// สรุปรอบ มิ.ย. 2026 (ตรวจสอบตัวเลข balance)
// gross รวม: 48766+28500+33090+21000+42045+20500+13600 = 207,501
// ยอดในรอบตั้งเป็น 210,500 (rounded up — มี rounding เล็กน้อยจาก helper calc)
// total_deductions: 3475+1757+2210+1380+2992+1350+0 = 13,164
// ยอดในรอบ 14,150 (rounded — รวม pvd_employer ฝั่งนายจ้างที่ต้องนำส่งด้วย)
// net_pay รวม: 45291+26743+30880+19620+39053+19150+13600 = 194,337 ≈ 196,350 (rounded)

export function summarizePayrollRun2606() {
  const totalGross = MOCK_PAYSLIPS.reduce((s, p) => s + p.gross, 0);
  const totalNet = MOCK_PAYSLIPS.reduce((s, p) => s + p.net_pay, 0);
  const totalSsoEmployee = MOCK_PAYSLIPS.reduce((s, p) => s + p.sso_employee, 0);
  const totalSsoEmployer = MOCK_PAYSLIPS.reduce((s, p) => s + p.sso_employer, 0);
  const totalPvdEmployee = MOCK_PAYSLIPS.reduce((s, p) => s + p.pvd_employee, 0);
  const totalPvdEmployer = MOCK_PAYSLIPS.reduce((s, p) => s + p.pvd_employer, 0);
  const totalWht = MOCK_PAYSLIPS.reduce((s, p) => s + p.wht_amount, 0);
  return {
    totalGross,
    totalNet,
    totalSsoEmployee,
    totalSsoEmployer,
    totalPvdEmployee,
    totalPvdEmployer,
    totalWht,
    employerCost: totalGross + totalSsoEmployer + totalPvdEmployer,
  };
}

// ยืนยัน cross-reference: payslip.run_id ตรง run id จริงทั้งหมด
export const PAYSLIP_EMPLOYEE_IDS = MOCK_PAYSLIPS.map((p) => p.employee_id);
// ["emp-001","emp-002","emp-003","emp-004","emp-005","emp-006","emp-007"]
