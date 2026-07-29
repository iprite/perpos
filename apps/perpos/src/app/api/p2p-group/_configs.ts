/**
 * _configs.ts — นิยาม CollectionConfig ของทุก resource
 *
 * ⚠️ ต้องอยู่ไฟล์นี้ ห้ามย้ายไป export จาก `route.ts` —
 * Next.js ตรวจ route module ว่า **export ได้เฉพาะ handler/route config ที่รู้จัก**
 * (ถ้า export ค่าอื่นจาก route.ts จะพังตอน `tsc` ที่ `.next/types/**` แบบอ่านไม่ออก)
 */

import type { CollectionConfig } from "./_lib";

export const COMPANIES_CONFIG: CollectionConfig = {
  table: "p2pg_companies",
  // `org_ref_id` ไม่อยู่ในนี้โดยตั้งใจ — ผูกบริษัทกับ org ในระบบทำได้เฉพาะทาง DB/super_admin
  // (contract §4: ถ้าผู้ใช้โมดูลตั้งเองได้ = ดูดงบข้ามองค์กรได้)
  allowed: [
    "name",
    "legal_name",
    "tax_id",
    "company_type",
    "company_status",
    "ownership_pct",
    "registered_capital",
    "paid_up_capital",
    "registered_date",
    "fiscal_year_end_month",
    "business_type",
    "address",
    "directors",
    "sort_order",
    "note",
  ],
  required: ["name"],
  orderBy: { column: "sort_order", ascending: true },
  beforeWrite: (payload) => {
    const pct = payload.ownership_pct;
    if (pct != null && (Number(pct) < 0 || Number(pct) > 100))
      return "สัดส่วนการถือหุ้นต้องอยู่ระหว่าง 0–100";
    const taxId = payload.tax_id;
    if (taxId != null && String(taxId).trim() !== "" && !/^\d{13}$/.test(String(taxId).trim()))
      return "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก";
    return null;
  },
};

export const FINANCIALS_CONFIG: CollectionConfig = {
  table: "p2pg_financials",
  refs: [{ field: "company_id", table: "p2pg_companies", label: "บริษัท" }],
  allowed: [
    "company_id",
    "period_month",
    "source",
    "revenue",
    "cogs",
    "opex",
    "other_income",
    "net_profit",
    "cash_balance",
    "total_assets",
    "total_liabilities",
    "equity",
    "ar",
    "ap",
    "headcount",
    "is_locked",
    "note",
  ],
  required: ["company_id", "period_month"],
  orderBy: { column: "period_month", ascending: false },
  upsertOn: "company_id,period_month",
  beforeWrite: (payload) => {
    const pm = String(payload.period_month ?? "");
    if (pm && !/^\d{4}-\d{2}-01$/.test(pm)) return "งวดต้องเป็นวันที่ 1 ของเดือน (YYYY-MM-01)";
    // เขียนจากหน้าเว็บ = กรอกเองเสมอ · เส้น auto เขียนผ่าน financials/sync (source='accounting')
    if (payload.source == null) payload.source = "manual";
    return null;
  },
};

export const INVESTMENTS_CONFIG: CollectionConfig = {
  table: "p2pg_investments",
  refs: [{ field: "company_id", table: "p2pg_companies", label: "บริษัท" }],
  allowed: [
    "company_id",
    "invest_date",
    "shares",
    "cost_amount",
    "ownership_pct_after",
    "method",
    "note",
  ],
  required: ["company_id", "invest_date", "cost_amount"],
  orderBy: { column: "invest_date", ascending: false },
  sensitive: true,
};

export const DIVIDENDS_CONFIG: CollectionConfig = {
  table: "p2pg_dividends",
  refs: [{ field: "company_id", table: "p2pg_companies", label: "บริษัท" }],
  allowed: [
    "company_id",
    "declared_date",
    "paid_date",
    "amount_declared",
    "amount_received",
    "wht_amount",
    "status",
    "note",
  ],
  required: ["company_id", "declared_date", "amount_declared"],
  orderBy: { column: "declared_date", ascending: false },
  sensitive: true,
  beforeWrite: (payload) => {
    if (payload.status === "paid" && payload.paid_date == null)
      return 'สถานะ "รับแล้ว" ต้องระบุวันที่รับเงิน';
    return null;
  },
};

export const LOANS_CONFIG: CollectionConfig = {
  table: "p2pg_loans",
  refs: [
    { field: "lender_company_id", table: "p2pg_companies", label: "บริษัทผู้ให้กู้" },
    { field: "borrower_company_id", table: "p2pg_companies", label: "บริษัทผู้กู้" },
  ],
  allowed: [
    "lender_company_id",
    "borrower_company_id",
    "contract_no",
    "principal",
    "interest_rate",
    "start_date",
    "due_date",
    "status",
    "note",
  ],
  required: ["lender_company_id", "borrower_company_id", "principal", "start_date"],
  orderBy: { column: "start_date", ascending: false },
  sensitive: true,
  beforeWrite: (payload) => {
    if (
      payload.lender_company_id != null &&
      payload.lender_company_id === payload.borrower_company_id
    )
      return "ผู้ให้กู้กับผู้กู้ต้องเป็นคนละบริษัท";
    return null;
  },
};

export const INTERCOMPANY_CONFIG: CollectionConfig = {
  table: "p2pg_intercompany",
  refs: [
    { field: "from_company_id", table: "p2pg_companies", label: "บริษัทต้นทาง" },
    { field: "to_company_id", table: "p2pg_companies", label: "บริษัทปลายทาง" },
    { field: "loan_id", table: "p2pg_loans", label: "สัญญาเงินกู้" },
  ],
  allowed: [
    "txn_date",
    "from_company_id",
    "to_company_id",
    "ic_type",
    "amount",
    "currency",
    "loan_id",
    "description",
    "doc_ref",
    "status",
    "settled_date",
    "counterparty_confirmed",
    "note",
  ],
  required: ["txn_date", "from_company_id", "to_company_id", "ic_type", "amount"],
  orderBy: { column: "txn_date", ascending: false },
  sensitive: true,
  beforeWrite: (payload) => {
    if (payload.from_company_id != null && payload.from_company_id === payload.to_company_id)
      return "ต้นทางกับปลายทางต้องเป็นคนละบริษัท";
    if (payload.amount != null && Number(payload.amount) < 0) return "จำนวนเงินต้องไม่ติดลบ";
    return null;
  },
};

export const BANK_ACCOUNTS_CONFIG: CollectionConfig = {
  table: "p2pg_bank_accounts",
  refs: [{ field: "company_id", table: "p2pg_companies", label: "บริษัท" }],
  allowed: [
    "company_id",
    "bank_name",
    "account_name",
    "account_no",
    "account_type",
    "currency",
    "is_active",
    "note",
  ],
  required: ["company_id", "bank_name"],
  orderBy: { column: "bank_name", ascending: true },
  sensitive: true,
};

export const BANK_BALANCES_CONFIG: CollectionConfig = {
  table: "p2pg_bank_balances",
  refs: [{ field: "bank_account_id", table: "p2pg_bank_accounts", label: "บัญชีธนาคาร" }],
  allowed: ["bank_account_id", "as_of_date", "balance", "source", "note"],
  required: ["bank_account_id", "as_of_date", "balance"],
  orderBy: { column: "as_of_date", ascending: false },
  upsertOn: "bank_account_id,as_of_date",
  sensitive: true,
};
