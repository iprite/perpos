/**
 * p2p_group — โมดูลบริษัทโฮลดิ้ง (P2P Group)
 * contract: .claude/module-factory/specs/p2p_group.md (v1)
 *
 * กฎที่ห้ามพัง:
 *  • `org_id` ของทุกตาราง = org ของ "โฮลดิ้ง" เสมอ (บริษัทลูกเป็นแถวใน p2pg_companies)
 *  • ตัวเลขเงิน `null` = ยังไม่มีข้อมูล ≠ 0 — อย่า `?? 0` แล้วเอาไปหาร
 *  • ตัวเลขอ่อนไหว (กำไร/ลงทุน/ปันผล/เงินกู้/เงินสด) = owner|manager เท่านั้น (§4)
 */

export type P2pGroupRole = "owner" | "manager" | "viewer";

export type CompanyType = "holding" | "subsidiary" | "associate" | "joint_venture";
export type CompanyStatus = "active" | "dormant" | "closed";
export type FinancialSource = "manual" | "accounting";
export type InvestmentMethod = "cost" | "equity";
export type DividendStatus = "declared" | "paid" | "cancelled";
export type LoanStatus = "active" | "repaid" | "written_off";
export type IcType =
  | "loan"
  | "loan_repayment"
  | "interest"
  | "management_fee"
  | "service"
  | "goods"
  | "expense_reimburse"
  | "dividend"
  | "capital";
export type IcStatus = "open" | "settled" | "cancelled";
export type BankAccountType = "current" | "savings" | "fixed" | "other";
export type BalanceSource = "manual" | "import";

export interface P2pgCompany {
  id: string;
  org_id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  company_type: CompanyType;
  company_status: CompanyStatus;
  ownership_pct: number | null;
  registered_capital: number | null;
  paid_up_capital: number | null;
  registered_date: string | null;
  fiscal_year_end_month: number | null;
  business_type: string | null;
  address: string | null;
  directors: string[];
  org_ref_id: string | null;
  org_link_at: string | null;
  sort_order: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface P2pgFinancial {
  id: string;
  org_id: string;
  company_id: string;
  period_month: string; // YYYY-MM-01
  source: FinancialSource;
  revenue: number | null;
  cogs: number | null;
  opex: number | null;
  other_income: number | null;
  net_profit: number | null;
  cash_balance: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  equity: number | null;
  ar: number | null;
  ap: number | null;
  headcount: number | null;
  is_locked: boolean;
  note: string | null;
}

export interface P2pgInvestment {
  id: string;
  org_id: string;
  company_id: string;
  invest_date: string;
  shares: number | null;
  cost_amount: number;
  ownership_pct_after: number | null;
  method: InvestmentMethod;
  note: string | null;
}

export interface P2pgDividend {
  id: string;
  org_id: string;
  company_id: string;
  declared_date: string;
  paid_date: string | null;
  amount_declared: number;
  amount_received: number | null;
  wht_amount: number | null;
  status: DividendStatus;
  note: string | null;
}

export interface P2pgLoan {
  id: string;
  org_id: string;
  lender_company_id: string;
  borrower_company_id: string;
  contract_no: string | null;
  principal: number;
  interest_rate: number | null;
  start_date: string;
  due_date: string | null;
  status: LoanStatus;
  note: string | null;
}

export interface P2pgIntercompany {
  id: string;
  org_id: string;
  txn_date: string;
  from_company_id: string;
  to_company_id: string;
  ic_type: IcType;
  amount: number;
  currency: string;
  loan_id: string | null;
  description: string | null;
  doc_ref: string | null;
  status: IcStatus;
  settled_date: string | null;
  counterparty_confirmed: boolean;
  confirmed_at: string | null;
  note: string | null;
}

export interface P2pgBankAccount {
  id: string;
  org_id: string;
  company_id: string;
  bank_name: string;
  account_name: string | null;
  account_no: string | null;
  account_type: BankAccountType;
  currency: string;
  is_active: boolean;
  note: string | null;
}

export interface P2pgBankBalance {
  id: string;
  org_id: string;
  bank_account_id: string;
  as_of_date: string;
  balance: number;
  source: BalanceSource;
  note: string | null;
}

/** เขียนได้ = owner|manager (viewer อ่านอย่างเดียว) */
export function canWriteP2pGroup(role: P2pGroupRole | string): boolean {
  return role === "owner" || role === "manager";
}

/**
 * เห็นตัวเลขอ่อนไหวได้ = owner|manager (contract §4).
 * ใช้ที่ **ฝั่ง server** เพื่อ strip field ก่อนส่งออก — ห้ามพึ่ง UI ซ่อนอย่างเดียว.
 */
export function canSeeSensitive(role: P2pGroupRole | string): boolean {
  return role === "owner" || role === "manager";
}

/** field ของงบรายเดือนที่ถือว่า "อ่อนไหว" (viewer ไม่เห็น) */
export const SENSITIVE_FINANCIAL_FIELDS = [
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
] as const;

/** ตัดฟิลด์อ่อนไหวออกจากงบรายเดือนสำหรับ viewer */
export function stripSensitiveFinancial<T extends Partial<P2pgFinancial>>(row: T): T {
  const out = { ...row };
  for (const f of SENSITIVE_FINANCIAL_FIELDS) {
    if (f in out) (out as Record<string, unknown>)[f] = null;
  }
  return out;
}
