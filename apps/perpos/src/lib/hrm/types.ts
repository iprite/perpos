// types.ts — HRM production row types (10 entity + enums)
// ยึดตาม spec §4 Data Contract ตรงเป๊ะ (snake_case = ชื่อคอลัมน์ DB hrm_*)
// ใช้ร่วม lib fetch + API routes + page (SSR). field/enum ต้องตรง contract — integration-reviewer เทียบ.

// ---- Enums (canonical, spec §4 ท้าย) ----
export type EmployeeStatus = "active" | "inactive" | "terminated";
export type EmploymentType = "monthly" | "daily" | "contract";
export type PayItemType = "earning" | "deduction";
export type YtdType = "none" | "income40_1";
export type FundType = "sso" | "pvd" | "gf" | "other";
export type RunStatus = "draft" | "pending_approval" | "approved" | "paid" | "cancelled";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type AttendanceStatus = "present" | "absent" | "leave" | "holiday";
export type DocType = "payslip" | "salary_cert" | "contract" | "other";
export type DocStatus = "draft" | "issued";

/** module role (modules.ts: owner > hr > viewer) */
export type HrmRole = "owner" | "hr" | "viewer";

// ---- 4.1 hrm_employees ----
export interface Employee {
  id: string;
  org_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department_tag?: string | null;
  position?: string | null;
  employment_type: EmploymentType;
  base_salary: number;
  tax_id?: string | null;
  ssn?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  start_date?: string | null;
  probation_end_date?: string | null;
  contract_end_date?: string | null;
  end_date?: string | null;
  status: EmployeeStatus;
  created_at?: string;
}

// ---- 4.2 hrm_pay_items ----
export interface PayItem {
  id: string;
  org_id: string;
  code: string;
  name: string;
  item_type: PayItemType;
  is_recurring: boolean;
  account_label?: string | null;
  ytd_type: YtdType;
  is_system: boolean;
  active: boolean;
  sort_order: number;
  created_at?: string;
}

// ---- 4.3 hrm_funds ----
export interface Fund {
  id: string;
  org_id: string;
  fund_type: FundType;
  name: string;
  employee_rate: number;
  employer_rate: number;
  ceiling_wage?: number | null;
  active: boolean;
  notes?: string | null;
  created_at?: string;
}

// ---- 4.4 hrm_account_settings ----
export interface AccountSetting {
  id: string;
  org_id: string;
  setting_key: string;
  account_label?: string | null;
  created_at?: string;
}

// ---- 4.5 hrm_payroll_runs ----
export interface PayrollRun {
  id: string;
  org_id: string;
  run_number: string;
  period_year: number;
  period_month: number;
  status: RunStatus;
  total_earnings: number;
  total_deductions: number;
  total_net: number;
  total_employer_cost: number;
  notes?: string | null;
  created_at?: string;
}

// ---- 4.6 hrm_payslips ----
export interface Payslip {
  id: string;
  org_id: string;
  run_id: string;
  employee_id: string;
  base_salary: number;
  ot_hours: number;
  ot_amount: number;
  absence_days: number;
  late_count: number;
  earnings_json: Array<{ pay_item_id: string; name: string; amount: number }>;
  deductions_json: Array<{ pay_item_id: string; name: string; amount: number }>;
  sso_employee: number;
  sso_employer: number;
  pvd_employee: number;
  pvd_employer: number;
  wht_amount: number;
  gross: number;
  total_deductions: number;
  net_pay: number;
  created_at?: string;
}

// ---- 4.7 hrm_leave_types ----
export interface LeaveType {
  id: string;
  org_id: string;
  code: string;
  name: string;
  quota_days_per_year: number;
  is_paid: boolean;
  active: boolean;
  created_at?: string;
}

// ---- 4.8 hrm_leave_requests ----
export interface LeaveRequest {
  id: string;
  org_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason?: string | null;
  status: LeaveStatus;
  approved_by?: string | null;
  decided_at?: string | null;
  created_at?: string;
}

// ---- 4.9 hrm_attendance ----
export interface Attendance {
  id: string;
  org_id: string;
  employee_id: string;
  work_date: string;
  status: AttendanceStatus;
  check_in?: string | null;
  check_out?: string | null;
  is_late: boolean;
  ot_hours: number;
  note?: string | null;
  created_at?: string;
}

// ---- 4.10 hrm_documents ----
export interface HrmDocument {
  id: string;
  org_id: string;
  employee_id: string;
  doc_type: DocType;
  title: string;
  issued_date?: string | null;
  ref_run_id?: string | null;
  storage_path?: string | null;
  status: DocStatus;
  created_at?: string;
}
