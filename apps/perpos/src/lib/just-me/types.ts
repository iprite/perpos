/**
 * just_me — ระบบบริหารโครงการ full loop (presale → construction)
 * contract = .claude/feature-factory/specs/just-me-project-loop.md §3 (naming lock) + §4 (data model)
 * ⛔ ชื่อฟิลด์/enum ทั้งหมดล็อกแล้ว — เพิ่มชื่อใหม่ต้องแก้ contract ก่อน
 */

// ─── enum / สถานะ ────────────────────────────────────────────────────────────
export type ProjectStatus =
  | "survey"
  | "boq"
  | "quoted"
  | "won"
  | "in_progress"
  | "completed"
  | "closed"
  | "lost"
  | "cancelled";

export type BoqStatus = "draft" | "approved" | "superseded";
export type BoqItemKind = "material" | "labor" | "subcontract" | "other";
export type PurchaseRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";
export type VendorQuoteStatus = "pending" | "received" | "selected" | "rejected";
export type BillingStatus = "planned" | "ready" | "invoiced" | "paid" | "cancelled";
export type ProjectFileKind = "survey_photo" | "drawing" | "contract" | "other";
export type ProjectCostKind = "labor" | "subcontract" | "transport" | "other";
export type MarginSource = "item" | "category" | "project" | "company";
export type MaterialCostMode = "auto" | "manual";

/** สถานะโครงการที่ยัง "มีชีวิต" — KPI รวมข้ามโครงการต้องตัดที่เหลือออก (§8 กฎ 4) */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  "survey",
  "boq",
  "quoted",
  "won",
  "in_progress",
  "completed",
  "closed",
];

// ─── entity ──────────────────────────────────────────────────────────────────
export interface JustMeProject {
  id: string;
  org_id: string;
  project_code: string;
  name: string;
  status: ProjectStatus;
  acc_contact_id: string | null;
  customer_name: string | null;
  site_address: string | null;
  latitude: number | null;
  longitude: number | null;
  manager_id: string | null;
  start_date: string | null;
  end_date: string | null;
  /** null = ยังไม่มีสัญญา (ห้ามเก็บ 0 แทน) */
  contract_amount: number | null;
  /** null จนกว่า BOQ จะถูกอนุมัติ */
  budget_cost: number | null;
  budget_revised_at: string | null;
  margin_pct: number | null;
  retention_pct: number;
  quotation_document_id: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
}

export interface JustMeProjectFile {
  id: string;
  org_id: string;
  project_id: string;
  file_kind: ProjectFileKind;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface JustMeWorkCategory {
  id: string;
  org_id: string;
  code: string | null;
  name: string;
  default_margin_pct: number | null;
  sort_order: number | null;
}

export interface JustMePriceBookRow {
  id: string;
  org_id: string;
  item_id: string | null;
  category_id: string | null;
  name: string;
  unit: string;
  material_cost_mode: MaterialCostMode;
  material_unit_cost_manual: number | null;
  labor_unit_cost: number;
  overhead_unit_cost: number;
  margin_pct: number | null;
  cost_alert_pct: number | null;
  baseline_material_cost: number | null;
  baseline_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface JustMeSettings {
  org_id: string;
  default_margin_pct: number;
  default_overhead_pct: number | null;
  cost_alert_pct: number;
  pr_approval_required: boolean;
  updated_at: string | null;
}

export interface JustMeBoq {
  id: string;
  org_id: string;
  project_id: string;
  revision_no: number;
  status: BoqStatus;
  title: string | null;
  approved_by: string | null;
  approved_at: string | null;
  /** snapshot ตอน approve — null ระหว่างเป็นฉบับร่าง */
  total_cost: number | null;
  total_amount: number | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

export interface JustMeBoqItem {
  id: string;
  org_id: string;
  boq_id: string;
  category_id: string | null;
  price_book_id: string | null;
  item_id: string | null;
  item_kind: BoqItemKind;
  name: string;
  unit: string;
  qty: number;
  /** snapshot ณ ตอนถอด BOQ — ไม่ join สดกับ price book */
  material_unit_cost: number;
  labor_unit_cost: number;
  overhead_unit_cost: number;
  margin_pct: number | null;
  margin_source: MarginSource | null;
  unit_price: number;
  amount: number;
  cost_amount: number;
  sort_order: number | null;
}

/** มุมมองที่ viewer เห็น (มาจาก view `just_me_boq_items_sell` — ไม่มีคอลัมน์ต้นทุน) */
export type JustMeBoqItemSell = Pick<
  JustMeBoqItem,
  | "id"
  | "org_id"
  | "boq_id"
  | "category_id"
  | "name"
  | "unit"
  | "qty"
  | "unit_price"
  | "amount"
  | "sort_order"
>;

export interface JustMeVendor {
  id: string;
  org_id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_name: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface JustMePurchaseRequest {
  id: string;
  org_id: string;
  pr_code: string;
  project_id: string | null;
  boq_id: string | null;
  status: PurchaseRequestStatus;
  needed_date: string | null;
  warehouse_id: string | null;
  selected_vendor_id: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  total_estimated_cost: number | null;
  total_selected_cost: number | null;
  over_budget_reason: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

export interface JustMePrItem {
  id: string;
  org_id: string;
  pr_id: string;
  boq_item_id: string | null;
  item_id: string | null;
  name: string;
  unit: string;
  qty: number;
  estimated_unit_cost: number | null;
  selected_unit_cost: number | null;
  received_qty: number;
}

export interface JustMeVendorQuote {
  id: string;
  org_id: string;
  pr_id: string;
  vendor_id: string;
  status: VendorQuoteStatus;
  quote_no: string | null;
  quote_date: string | null;
  total_amount: number | null;
  delivery_days: number | null;
  credit_terms: string | null;
  file_path: string | null;
  note: string | null;
  created_at: string;
}

export interface JustMeVendorQuoteItem {
  id: string;
  org_id: string;
  quote_id: string;
  pr_item_id: string;
  unit_cost: number | null;
  qty: number | null;
  note: string | null;
}

export interface JustMeProjectCost {
  id: string;
  org_id: string;
  project_id: string;
  cost_kind: ProjectCostKind;
  cost_date: string;
  description: string | null;
  amount: number;
  vendor_id: string | null;
  boq_item_id: string | null;
  file_path: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface JustMeProjectBilling {
  id: string;
  org_id: string;
  project_id: string;
  seq: number;
  title: string | null;
  percent_of_contract: number | null;
  amount: number;
  retention_amount: number;
  due_date: string | null;
  status: BillingStatus;
  invoice_document_id: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string;
}

export interface JustMeProjectProgress {
  id: string;
  org_id: string;
  project_id: string;
  boq_item_id: string | null;
  progress_date: string;
  done_qty: number | null;
  percent: number | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

/** แถวเบิก/รับของจากคลังที่ผูกโครงการแล้ว (subset ของ just_me_stock_movements) */
export interface JustMeProjectUsageRow {
  id: string;
  movement_type: "receive" | "transfer" | "issue" | "return";
  item_id: string;
  quantity: number;
  /** ต้นทุนรวมของรายการนั้น — viewer จะไม่ได้รับค่านี้ (ถูก strip ที่ API) */
  total_cost: number | null;
  project_id: string | null;
  boq_item_id: string | null;
  requested_by: string | null;
  requester_name: string | null;
  /** ไม่ null = แถวนี้คือ "รายการกลับรายการ" ของ movement ที่อ้างถึง */
  reversal_of_id: string | null;
  created_at: string;
}
