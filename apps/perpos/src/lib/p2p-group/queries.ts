/**
 * queries.ts — fetch logic ของโมดูลโฮลดิ้ง (RLS-scoped client)
 * ใช้ร่วม: SSR page (createSupabaseServerClient) + API route (createAuthedClient).
 * caller ต้องเช็ค membership/role ก่อนเสมอ · ทุก query filter `org_id` (= org ของโฮลดิ้ง).
 *
 * ⚠️ ห้ามส่ง admin service-role client เข้ามาที่นี่ (ข้อมูล per-org — จะ bypass RLS)
 *    ยกเว้นเส้น auto-pull ที่อยู่ใน accounting-sync.ts ซึ่งตั้งใจข้าม org และมีด่านของตัวเอง
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  P2pgBankAccount,
  P2pgBankBalance,
  P2pgCompany,
  P2pgDividend,
  P2pgFinancial,
  P2pgIntercompany,
  P2pgLoan,
} from "./types";
import { monthRange } from "./metrics";

export async function listCompanies(db: SupabaseClient, orgId: string): Promise<P2pgCompany[]> {
  const { data, error } = await db
    .from("p2pg_companies")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as P2pgCompany[];
}

export async function listFinancials(
  db: SupabaseClient,
  orgId: string,
  opts?: { periodMonth?: string; from?: string; to?: string; companyId?: string },
): Promise<P2pgFinancial[]> {
  let q = db.from("p2pg_financials").select("*").eq("org_id", orgId);
  if (opts?.periodMonth) q = q.eq("period_month", opts.periodMonth);
  if (opts?.from) q = q.gte("period_month", opts.from);
  if (opts?.to) q = q.lte("period_month", opts.to);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  const { data, error } = await q.order("period_month", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as P2pgFinancial[];
}

export async function listInvestments(db: SupabaseClient, orgId: string) {
  const { data, error } = await db
    .from("p2pg_investments")
    .select("*")
    .eq("org_id", orgId)
    .order("invest_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDividends(db: SupabaseClient, orgId: string): Promise<P2pgDividend[]> {
  const { data, error } = await db
    .from("p2pg_dividends")
    .select("*")
    .eq("org_id", orgId)
    .order("declared_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as P2pgDividend[];
}

export async function listLoans(db: SupabaseClient, orgId: string): Promise<P2pgLoan[]> {
  const { data, error } = await db
    .from("p2pg_loans")
    .select("*")
    .eq("org_id", orgId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as P2pgLoan[];
}

export async function listIntercompany(
  db: SupabaseClient,
  orgId: string,
  opts?: { periodMonth?: string; from?: string; to?: string; unconfirmedOnly?: boolean },
): Promise<P2pgIntercompany[]> {
  let q = db.from("p2pg_intercompany").select("*").eq("org_id", orgId);
  if (opts?.periodMonth) {
    const { from, to } = monthRange(opts.periodMonth);
    q = q.gte("txn_date", from).lte("txn_date", to);
  }
  if (opts?.from) q = q.gte("txn_date", opts.from);
  if (opts?.to) q = q.lte("txn_date", opts.to);
  if (opts?.unconfirmedOnly) q = q.eq("counterparty_confirmed", false).neq("status", "cancelled");
  const { data, error } = await q.order("txn_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as P2pgIntercompany[];
}

export async function listBankAccounts(
  db: SupabaseClient,
  orgId: string,
): Promise<P2pgBankAccount[]> {
  const { data, error } = await db
    .from("p2pg_bank_accounts")
    .select("*")
    .eq("org_id", orgId)
    .order("bank_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as P2pgBankAccount[];
}

export async function listBankBalances(
  db: SupabaseClient,
  orgId: string,
  opts?: { asOf?: string },
): Promise<P2pgBankBalance[]> {
  let q = db.from("p2pg_bank_balances").select("*").eq("org_id", orgId);
  if (opts?.asOf) q = q.lte("as_of_date", opts.asOf);
  const { data, error } = await q.order("as_of_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as P2pgBankBalance[];
}

/** ยอดล่าสุดของแต่ละบัญชี (จากรายการที่ดึงมาแล้ว — เรียงวันที่ลงมาก่อน) */
export function latestBalanceByAccount(rows: P2pgBankBalance[]): Map<string, P2pgBankBalance> {
  const map = new Map<string, P2pgBankBalance>();
  for (const r of rows) {
    const cur = map.get(r.bank_account_id);
    if (!cur || r.as_of_date > cur.as_of_date) map.set(r.bank_account_id, r);
  }
  return map;
}
