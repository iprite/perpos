// types.ts — accounting production row types (12 entity acc_* + enums)
// ยึดตาม contract §4 Data Contract v4 ตรงเป๊ะ (snake_case = ชื่อคอลัมน์ DB acc_*)
// ใช้ร่วม lib fetch + API routes + page (SSR). integration-reviewer เทียบกับ migration + fixtures.

// ---- Enums (canonical §4.0) ----
export type AccDocType =
  | "quotation" // ใบเสนอราคา
  | "invoice" // ใบแจ้งหนี้
  | "receipt" // ใบเสร็จรับเงิน
  | "tax_invoice" // ใบกำกับภาษี (ม.86/4)
  | "receipt_tax_invoice" // ใบเสร็จรับเงิน/ใบกำกับภาษี
  | "credit_note" // ใบลดหนี้ (ม.86/10)
  | "debit_note" // ใบเพิ่มหนี้ (ม.86/9)
  | "billing_note" // ใบวางบิล
  | "delivery_note"; // ใบส่งของ

/** เอกสารที่เป็น "ใบกำกับภาษี" ตามกฎหมาย → ต้องพิมพ์ครบตาม ม.86/4 + เป็นฐานภาษีขาย */
export const TAX_DOC_TYPES = [
  "tax_invoice",
  "receipt_tax_invoice",
  "credit_note",
  "debit_note",
] as const satisfies readonly AccDocType[];

export function isTaxDocument(t: AccDocType): boolean {
  return (TAX_DOC_TYPES as readonly string[]).includes(t);
}

/** ใบลดหนี้/ใบเพิ่มหนี้ — ต้องอ้างใบกำกับภาษีเดิม (ม.86/10 (3), ม.86/9 (3)) */
export function requiresRefDocument(t: AccDocType): boolean {
  return t === "credit_note" || t === "debit_note";
}
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
  /** สาขาของกิจการผู้ขาย เช่น "สำนักงานใหญ่" / "สาขาที่ 00001" (ม.86/4) */
  branch: string | null;
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
  /** หน่วยนับ (ม.86/4 (5)) — snapshot จาก acc_products.unit ตอนออกเอกสาร */
  unit: string | null;
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
  // ── ฟิลด์ ม.86/4 (snapshot ตอนออกเอกสาร — ห้าม join สดตอนพิมพ์) ──
  seller_name: string | null;
  seller_address: string | null;
  seller_tax_id: string | null;
  seller_branch: string | null;
  buyer_name: string | null;
  buyer_address: string | null;
  buyer_tax_id: string | null;
  buyer_branch: string | null;
  /** เล่มที่ (ม.86/4 (4)) */
  book_number: string | null;
  /** อัตรา VAT ที่ใช้กับใบนี้ (7 / 0) · null = ไม่เกี่ยวกับ VAT */
  vat_rate: number | null;
  /** ใบกำกับภาษีเดิมที่ใบลดหนี้/ใบเพิ่มหนี้อ้างถึง */
  ref_document_id: string | null;
  /** วัน-เวลาที่ออกเอกสารจริง (ม.86/4 (7)) */
  issued_at: string | null;
  // computed for UI / join
  lines?: AccDocumentLine[];
  contact_name?: string;
  /** เลขที่ของเอกสารที่อ้างถึง (join สำหรับแสดงผลเท่านั้น) */
  ref_doc_number?: string;
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

// ---- acc_purchase_documents — ทะเบียนใบกำกับภาษีซื้อ (ฝั่งซื้อ) ----
export type AccPurchaseDocType =
  | "tax_invoice" // ใบกำกับภาษี (เต็มรูป)
  | "receipt_tax_invoice" // ใบเสร็จรับเงิน/ใบกำกับภาษี
  | "credit_note" // ใบลดหนี้จากผู้ขาย → ลดภาษีซื้อ
  | "debit_note" // ใบเพิ่มหนี้จากผู้ขาย → เพิ่มภาษีซื้อ
  | "receipt" // ใบเสร็จ/บิลเงินสด (เครดิตภาษีซื้อไม่ได้)
  | "abbreviated_tax_invoice"; // ใบกำกับภาษีอย่างย่อ ม.86/6 (เครดิตไม่ได้)

export type AccPurchaseDocStatus = "draft" | "recorded" | "void";

/** ชนิดเอกสารที่กฎหมายให้เครดิตภาษีซื้อได้ (ตรงกับ CHECK ใน migration) */
export const PURCHASE_VAT_CLAIMABLE_TYPES = [
  "tax_invoice",
  "receipt_tax_invoice",
  "credit_note",
  "debit_note",
] as const satisfies readonly AccPurchaseDocType[];

export function canClaimPurchaseVat(t: AccPurchaseDocType): boolean {
  return (PURCHASE_VAT_CLAIMABLE_TYPES as readonly string[]).includes(t);
}

/** ใบลดหนี้จากผู้ขาย = ลดภาษีซื้อ → เข้า ภ.พ.30 ด้วยเครื่องหมายลบ */
export function isPurchaseCreditNote(t: AccPurchaseDocType): boolean {
  return t === "credit_note";
}

export interface AccPurchaseDocumentLine {
  id: string;
  org_id: string;
  document_id: string;
  item_name: string;
  description: string;
  qty: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  /** บัญชีปลายทาง (Dr) ของบรรทัดนี้ — ใช้ตอน auto journal */
  account_id: string | null;
  sort_order: number;
  account_code?: string;
  account_name?: string;
}

export interface AccPurchaseDocument {
  id: string;
  org_id: string;
  doc_type: AccPurchaseDocType;
  /** เลขที่บนใบกำกับ "ของผู้ขาย" — ไม่ได้ generate เอง */
  doc_number: string;
  contact_id: string | null;
  issue_date: string;
  /** งวดภาษีที่นำภาษีซื้อไปใช้ (แยกจาก issue_date — ม.82/3 เลื่อนได้ภายใน 6 เดือน) */
  tax_year: number;
  tax_month: number;
  seller_name: string | null;
  seller_address: string | null;
  seller_tax_id: string | null;
  seller_branch: string | null;
  buyer_name: string | null;
  buyer_address: string | null;
  buyer_tax_id: string | null;
  buyer_branch: string | null;
  vat_rate: number | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  wht_rate: number;
  wht_amount: number;
  /** เครดิตภาษีซื้อได้หรือไม่ — false = ภาษีซื้อต้องห้าม ม.82/5 หรือเอกสารที่เครดิตไม่ได้ */
  is_vat_claimable: boolean;
  non_claimable_note: string | null;
  status: AccPurchaseDocStatus;
  ref_document_id: string | null;
  journal_entry_id: string | null;
  ocr_job_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  // computed for UI / join
  lines?: AccPurchaseDocumentLine[];
  contact_name?: string;
  ref_doc_number?: string;
  journal_entry_number?: string;
}
