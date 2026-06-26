// payroll-bridge.ts — Mock HRM payroll run payload สำหรับสะพาน hrm→accounting
// ปุ่ม "จำลอง: เงินเดือนจ่ายแล้ว" ใน B1 ใช้ข้อมูลนี้โชว์ journal 8 บรรทัด + pnd1 draft
//
// สมการ I1 (binding):
//   total_earnings = net_total + wht_total + sso_employee_total + pvd_employee_total + extra_deductions_total
//   พิสูจน์: 58,500 = 49,850 + 3,150 + 2,700 + 2,700 + 100 = 58,500 ✓
//
// Journal balance (8 บรรทัด):
//   Σ Dr = total_earnings + sso_employer_total + pvd_employer_total
//         = 58,500 + 2,700 + 2,700 = 63,900
//   Σ Cr = net_total + wht_total + (sso_emp + sso_er) + (pvd_emp + pvd_er) + extra
//         = 49,850 + 3,150 + (2,700+2,700) + (2,700+2,700) + 100
//         = 49,850 + 3,150 + 5,400 + 5,400 + 100 = 63,900 ✓

import type { PayrollBridgePayload } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

export const mockPayrollBridgeRun: PayrollBridgePayload = {
  org_id: MOCK_ORG_ID,
  run_id: "payroll-run-jun-2026",
  run_number: "PAY-2026-06",
  period_year: 2026,
  period_month: 6,
  // I1: gross รวม OT/เบี้ย/ค่าตำแหน่ง (ไม่แตก OT แยกบัญชี)
  total_earnings: 58500.0,
  sso_employee_total: 2700.0, // Σ payslip.sso_employee
  sso_employer_total: 2700.0, // Σ payslip.sso_employer
  pvd_employee_total: 2700.0, // Σ payslip.pvd_employee
  pvd_employer_total: 2700.0, // Σ payslip.pvd_employer
  wht_total: 3150.0, // Σ payslip.wht_amount
  // I2: DERIVE = Σ(total_deductions − sso_employee − pvd_employee − wht_amount)
  extra_deductions_total: 100.0,
  net_total: 49850.0, // Σ payslip.net_pay
};

// ---- สรุปที่จะแสดงใน dialog "ผลการบันทึก" ----

export interface PayrollBridgeResult {
  entry_created: boolean;
  journal_created: boolean;
  pnd1_created: boolean;
  journal_entry_number: string;
  total_debit: number;
  total_credit: number;
  pnd1_due_date: string;
  pnd1_wht_total: number;
}

/** ผลจำลองเมื่อกด "จำลอง: เงินเดือนจ่ายแล้ว" */
export const mockPayrollBridgeResult: PayrollBridgeResult = {
  entry_created: true,
  journal_created: true,
  pnd1_created: true,
  journal_entry_number: "JV-2026-0009",
  total_debit: 63900.0, // 58,500+2,700+2,700
  total_credit: 63900.0, // 49,850+3,150+5,400+5,400+100 ✓
  pnd1_due_date: "2026-07-07",
  pnd1_wht_total: 3150.0,
};
