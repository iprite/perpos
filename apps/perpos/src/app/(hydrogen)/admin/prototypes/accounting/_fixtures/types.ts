// types.ts — accounting fixture types (11 entity acc_* + enums)
// ยึดตาม spec §4 Data Contract v3 ตรงเป๊ะ

// ---- Enums (canonical §4.0) ----

export type AccDocType = "quotation" | "invoice" | "receipt";

export type AccDocStatus = "draft" | "sent" | "accepted" | "paid" | "void" | "overdue";

export type AccEntryKind = "income" | "expense";

export type AccEntrySource = "manual" | "document" | "payroll" | "line" | "ai";

export type AccJournalSource = "manual" | "document" | "payroll" | "depreciation" | "ai";

export type AccAccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type AccAssetStatus = "active" | "disposed";

export type AccDeprMethod = "straight_line";

export type AccJournalStatus = "draft" | "posted" | "void";

export type AccPeriodStatus = "open" | "closed";

export type AccTaxKind = "pp30" | "pnd1" | "pnd3" | "pnd53";

export type AccTaxStatus = "draft" | "ready" | "filed";

// WHT rate enum values (เก็บเป็น number)
export type AccWhtRate = 1 | 2 | 3 | 5 | 10 | 15;

// ---- Interfaces (§4.1–§4.11) ----

/**
 * §4.11 acc_org_settings — ตั้งค่าองค์กร (1 แถวต่อ org)
 */
export interface AccOrgSettings {
  org_id: string;
  is_vat_registered: boolean; // default false (Non-VAT)
  vat_rate: number; // default 7.00
  fiscal_start_month: number; // default 1
  doc_number_prefix: Record<string, string> | null; // เช่น { quotation: "QT", invoice: "INV" }
  address: string | null;
  tax_id: string | null;
  org_name?: string | null; // ชื่อบริษัทบนเอกสาร (default placeholder)
  logo_data_url?: string | null; // โลโก้ PNG (data URL) — อัปโหลดที่ตั้งค่า, ใส่หัวเอกสาร
  signature_data_url?: string | null; // ลายเซนผู้มีอำนาจลงนาม PNG (data URL) — ใส่ช่องเซ็น
  created_at: string;
}

/**
 * §4.1 acc_contacts — ลูกค้า/ผู้ขาย/ทั้งสอง
 */
export interface AccContact {
  id: string;
  org_id: string;
  kind: "customer" | "vendor" | "both";
  name: string;
  tax_id: string | null; // 13 หลัก
  branch: string | null; // สำนักงานใหญ่/สาขา
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

/** ประเภทส่วนลดต่อรายการ */
export type AccDiscountType = "amount" | "percent";

/**
 * §4.3 acc_document_lines — รายการในเอกสาร
 *
 * สูตร:
 *   lineDiscountAmount = discount_type==='percent'
 *     ? round2(qty * unit_price * discount / 100)
 *     : discount
 *   amount = max(0, qty * unit_price − lineDiscountAmount)
 */
export interface AccDocumentLine {
  id: string;
  org_id: string;
  document_id: string;
  item_name: string; // ชื่อสินค้า/บริการ (สั้น) — แสดงเป็น header รายการ
  description: string; // คำอธิบายรายการ (รายละเอียดเพิ่มเติม, อาจว่าง "")
  qty: number;
  unit_price: number;
  discount: number; // ค่าที่กรอก: ถ้า amount=บาท, ถ้า percent=% (เช่น 10 = 10%)
  discount_type: AccDiscountType; // default 'amount'
  amount: number; // qty × unit_price − lineDiscountAmount (ดูสูตรด้านบน)
  sort_order: number;
  product_id: string | null; // link ไป acc_products.id, null = พิมพ์เอง
}

/**
 * §4.2 acc_documents — เอกสารขาย (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ)
 */
export interface AccDocument {
  id: string;
  org_id: string;
  doc_type: AccDocType;
  doc_number: string; // เช่น INV-2026-0001
  contact_id: string | null;
  issue_date: string; // ISO YYYY-MM-DD
  due_date: string | null;
  status: AccDocStatus;
  vat_enabled: boolean; // snapshot ตอนออก — default false
  subtotal: number;
  vat_amount: number; // 0 ถ้า non-VAT
  total: number; // subtotal + vat_amount
  wht_rate?: number; // หัก ณ ที่จ่าย % (0/undefined = ไม่หัก) — 1|2|3|5|10|15
  wht_amount?: number; // = subtotal × wht_rate/100 (ผู้จ่ายหักไว้)
  // net_payable (ยอดชำระสุทธิ) = total − wht_amount — คำนวณตอนแสดง
  converted_from_id: string | null; // quotation→invoice→receipt chain
  note: string | null;
  created_at: string;
  // computed for UI
  lines?: AccDocumentLine[];
  contact_name?: string; // join snapshot
}

/**
 * §4.4 acc_entries — รายรับ/รายจ่าย cockpit (สมุดง่ายของเจ้าของ)
 */
export interface AccEntry {
  id: string;
  org_id: string;
  kind: AccEntryKind;
  entry_date: string; // ISO YYYY-MM-DD
  amount: number;
  category: string | null;
  description: string | null;
  contact_id: string | null;
  source: AccEntrySource;
  source_ref_id: string | null;
  wht_rate: number | null; // % (1,2,3,5,10,15)
  wht_amount: number | null;
  journal_entry_id: string | null;
  created_at: string;
  // computed for UI
  contact_name?: string;
}

/**
 * §4.5 acc_accounts — ผังบัญชี (chart of accounts)
 */
export interface AccAccount {
  id: string;
  org_id: string;
  code: string; // เช่น "1010"
  name: string;
  account_type: AccAccountType;
  parent_id: string | null; // ลำดับชั้น
  is_active: boolean;
  is_system: boolean; // seed — ลบไม่ได้
  created_at: string;
  // computed for UI (tree)
  level?: number;
  children?: AccAccount[];
}

/**
 * §4.7 acc_journal_lines — บรรทัด Dr/Cr
 */
export interface AccJournalLine {
  id: string;
  org_id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number; // default 0
  credit: number; // default 0
  line_note: string | null;
  sort_order: number;
  // computed for UI
  account_code?: string;
  account_name?: string;
}

/**
 * §4.6 acc_journal_entries — สมุดรายวัน (header)
 * Σdebit = Σcredit เมื่อ posted
 */
export interface AccJournalEntry {
  id: string;
  org_id: string;
  entry_number: string; // JV-2026-0001
  entry_date: string;
  description: string | null;
  status: AccJournalStatus;
  period_id: string | null;
  source: AccJournalSource;
  source_ref_id: string | null;
  period_year: number | null; // payroll/depreciation
  period_month: number | null; // payroll/depreciation
  total_debit: number;
  total_credit: number;
  created_by: string | null;
  created_at: string;
  // computed for UI
  lines?: AccJournalLine[];
}

/**
 * §4.8 acc_periods — งวดบัญชี
 */
export interface AccPeriod {
  id: string;
  org_id: string;
  year: number;
  month: number; // 1-12
  status: AccPeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
}

/**
 * §4.9 acc_tax_filings — แบบภาษี (PP30/PND1/3/53)
 */
export interface AccTaxFiling {
  id: string;
  org_id: string;
  tax_kind: AccTaxKind;
  period_year: number;
  period_month: number;
  status: AccTaxStatus;
  sales_vat: number | null; // PP30
  purchase_vat: number | null; // PP30
  net_payable: number | null; // ยอดต้องชำระ/ขอคืน
  wht_total: number | null; // PND รวม
  due_date: string; // กำหนดยื่น
  filed_at: string | null;
  created_at: string;
}

/**
 * §4.10 acc_assets — ทะเบียนสินทรัพย์ + ค่าเสื่อม
 */
export interface AccAsset {
  id: string;
  org_id: string;
  name: string;
  asset_account_id: string; // → acc_accounts (1xxx)
  acquire_date: string;
  cost: number;
  salvage_value: number; // default 0
  useful_life_months: number;
  depreciation_method: AccDeprMethod;
  accumulated_depreciation: number; // default 0
  status: AccAssetStatus;
  created_at: string;
  // computed for UI
  book_value?: number; // cost - accumulated_depreciation
  monthly_depreciation?: number; // (cost - salvage_value) / useful_life_months
  asset_account_name?: string;
}

// ---- Products / Master Catalog (acc_products) ----

/** ประเภทสินค้า/บริการ */
export type AccProductKind = "good" | "service";

/**
 * acc_products — ทะเบียนสินค้าและบริการ (master catalog)
 * product_id ใน AccDocumentLine link มาที่นี่
 */
export interface AccProduct {
  id: string;
  org_id: string;
  kind: AccProductKind;
  code: string | null; // รหัสสินค้า/SKU เช่น SVC-001, PRD-001
  name: string;
  unit: string; // เช่น 'ชิ้น' / 'ชั่วโมง' / 'งาน' / 'เดือน'
  unit_price: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
}

// ---- Payroll Bridge Mock (§4.12 / §4 สะพาน) ----

/**
 * Mock payload จาก hrm payroll run → accounting
 * สมการ I1 (binding): total_earnings = net_total + wht_total + sso_employee_total + pvd_employee_total + extra_deductions_total
 */
export interface PayrollBridgePayload {
  org_id: string;
  run_id: string;
  run_number: string;
  period_year: number;
  period_month: number;
  total_earnings: number; // gross รวม OT/เบี้ย/ค่าตำแหน่ง (5100)
  sso_employee_total: number; // Σ payslip.sso_employee
  sso_employer_total: number; // Σ payslip.sso_employer
  pvd_employee_total: number; // Σ payslip.pvd_employee
  pvd_employer_total: number; // Σ payslip.pvd_employer
  wht_total: number; // Σ payslip.wht_amount
  extra_deductions_total: number; // DERIVE: Σ(total_deductions − sso_employee − pvd_employee − wht_amount)
  net_total: number; // Σ payslip.net_pay
}

// ---- Summary helpers (for dashboard) ----

export interface AccEntrySummary {
  total_income: number;
  total_expense: number;
  net: number;
  income_count: number;
  expense_count: number;
}
