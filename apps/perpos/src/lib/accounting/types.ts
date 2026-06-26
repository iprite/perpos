// types.ts — accounting production row types (12 entity acc_* + enums)
// ยึดตาม contract §4 Data Contract v4 ตรงเป๊ะ (snake_case = ชื่อคอลัมน์ DB acc_*)
// ใช้ร่วม lib fetch + API routes + page (SSR). integration-reviewer เทียบกับ migration + fixtures.

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
export type AccWhtRate = 1 | 2 | 3 | 5 | 10 | 15;
export type AccDiscountType = "amount" | "percent";
export type AccProductKind = "good" | "service";

/** module role (modules.ts: owner > accountant > staff > viewer) */
export type AccountingRole = "owner" | "accountant" | "staff" | "viewer";

// ---- 4.11 acc_org_settings ----
export interface AccOrgSettings {
  org_id: string;
  is_vat_registered: boolean;
  vat_rate: number;
  fiscal_start_month: number;
  doc_number_prefix: Record<string, string> | null;
  address: string | null;
  tax_id: string | null;
  org_name: string | null;
  logo_data_url: string | null;
  signature_data_url: string | null;
  created_at: string;
}

// ---- 4.1 acc_contacts ----
export interface AccContact {
  id: string;
  org_id: string;
  kind: "customer" | "vendor" | "both";
  name: string;
  tax_id: string | null;
  branch: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

// ---- acc_products (entity 12) ----
export interface AccProduct {
  id: string;
  org_id: string;
  kind: AccProductKind;
  code: string | null;
  name: string;
  unit: string | null;
  unit_price: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
}

// ---- 4.3 acc_document_lines ----
export interface AccDocumentLine {
  id: string;
  org_id: string;
  document_id: string;
  item_name: string;
  description: string;
  qty: number;
  unit_price: number;
  discount: number;
  discount_type: AccDiscountType;
  amount: number;
  sort_order: number;
  product_id: string | null;
}

// ---- 4.2 acc_documents ----
export interface AccDocument {
  id: string;
  org_id: string;
  doc_type: AccDocType;
  doc_number: string;
  contact_id: string | null;
  issue_date: string;
  due_date: string | null;
  status: AccDocStatus;
  vat_enabled: boolean;
  subtotal: number;
  vat_amount: number;
  total: number;
  wht_rate: number;
  wht_amount: number;
  converted_from_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  // computed for UI / join
  lines?: AccDocumentLine[];
  contact_name?: string;
}

// ---- 4.4 acc_entries ----
export interface AccEntry {
  id: string;
  org_id: string;
  kind: AccEntryKind;
  entry_date: string;
  amount: number;
  category: string | null;
  description: string | null;
  contact_id: string | null;
  source: AccEntrySource;
  source_ref_id: string | null;
  wht_rate: number | null;
  wht_amount: number | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
  contact_name?: string;
}

// ---- 4.5 acc_accounts ----
export interface AccAccount {
  id: string;
  org_id: string;
  code: string;
  name: string;
  account_type: AccAccountType;
  parent_id: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  level?: number;
  children?: AccAccount[];
}

// ---- 4.7 acc_journal_lines ----
export interface AccJournalLine {
  id: string;
  org_id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  line_note: string | null;
  sort_order: number;
  account_code?: string;
  account_name?: string;
}

// ---- 4.6 acc_journal_entries ----
export interface AccJournalEntry {
  id: string;
  org_id: string;
  entry_number: string;
  entry_date: string;
  description: string | null;
  status: AccJournalStatus;
  period_id: string | null;
  source: AccJournalSource;
  source_ref_id: string | null;
  period_year: number | null;
  period_month: number | null;
  total_debit: number;
  total_credit: number;
  created_by: string | null;
  created_at: string;
  lines?: AccJournalLine[];
}

// ---- 4.8 acc_periods ----
export interface AccPeriod {
  id: string;
  org_id: string;
  year: number;
  month: number;
  status: AccPeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
}

// ---- 4.9 acc_tax_filings ----
export interface AccTaxFiling {
  id: string;
  org_id: string;
  tax_kind: AccTaxKind;
  period_year: number;
  period_month: number;
  status: AccTaxStatus;
  sales_vat: number | null;
  purchase_vat: number | null;
  net_payable: number | null;
  wht_total: number | null;
  due_date: string;
  filed_at: string | null;
  created_by: string | null;
  created_at: string;
}

// ---- 4.10 acc_assets ----
export interface AccAsset {
  id: string;
  org_id: string;
  name: string;
  asset_account_id: string;
  acquire_date: string;
  cost: number;
  salvage_value: number;
  useful_life_months: number;
  depreciation_method: AccDeprMethod;
  accumulated_depreciation: number;
  status: AccAssetStatus;
  created_by: string | null;
  created_at: string;
  book_value?: number;
  monthly_depreciation?: number;
  asset_account_name?: string;
}

// ---- Report shapes ----
export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: AccAccountType;
  debit: number;
  credit: number;
}

export interface IncomeStatementRow {
  account_id: string;
  code: string;
  name: string;
  amount: number;
}

export interface AccEntrySummary {
  total_income: number;
  total_expense: number;
  net: number;
  income_count: number;
  expense_count: number;
}
