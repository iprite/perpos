/**
 * reports.ts — งบการเงินจาก journal posted (group by account).
 * คำนวณจาก acc_journal_lines ของ entries status='posted' เท่านั้น (draft/void ไม่นับ).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccAccountType, TrialBalanceRow } from "./types";

interface PostedLine {
  account_id: string;
  debit: number;
  credit: number;
  code: string;
  name: string;
  account_type: AccAccountType;
}

/**
 * ดึงบรรทัด journal ที่ posted แล้ว + join บัญชี ภายในช่วงงวด (year/เดือนถึงเดือน).
 * period filter ผ่าน entry_date (>= from, <= to).
 */
async function fetchPostedLines(
  db: SupabaseClient,
  orgId: string,
  opts?: { from?: string; to?: string; accountId?: string },
): Promise<PostedLine[]> {
  let q = db
    .from("acc_journal_lines")
    .select(
      "account_id, debit, credit, acc_accounts(code, name, account_type), acc_journal_entries!inner(status, entry_date, org_id)",
    )
    .eq("org_id", orgId)
    .eq("acc_journal_entries.status", "posted")
    .eq("acc_journal_entries.org_id", orgId);
  if (opts?.accountId) q = q.eq("account_id", opts.accountId);
  if (opts?.from) q = q.gte("acc_journal_entries.entry_date", opts.from);
  if (opts?.to) q = q.lte("acc_journal_entries.entry_date", opts.to);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => {
    const acc = r.acc_accounts as {
      code?: string;
      name?: string;
      account_type?: AccAccountType;
    } | null;
    return {
      account_id: String(r.account_id),
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      code: acc?.code ?? "",
      name: acc?.name ?? "",
      account_type: (acc?.account_type ?? "asset") as AccAccountType,
    };
  });
}

/** งบทดลอง — Σdebit/Σcredit ต่อบัญชี (net แสดงฝั่งที่มากกว่า). */
export async function trialBalance(
  db: SupabaseClient,
  orgId: string,
  opts?: { from?: string; to?: string },
): Promise<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number }> {
  const lines = await fetchPostedLines(db, orgId, opts);
  const map = new Map<string, TrialBalanceRow>();
  for (const l of lines) {
    const cur = map.get(l.account_id) ?? {
      account_id: l.account_id,
      code: l.code,
      name: l.name,
      account_type: l.account_type,
      debit: 0,
      credit: 0,
    };
    cur.debit += l.debit;
    cur.credit += l.credit;
    map.set(l.account_id, cur);
  }
  // แสดง net balance ฝั่งเดียวต่อบัญชี
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of Array.from(map.values())) {
    const net = r.debit - r.credit;
    const row: TrialBalanceRow = {
      account_id: r.account_id,
      code: r.code,
      name: r.name,
      account_type: r.account_type,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
    };
    totalDebit += row.debit;
    totalCredit += row.credit;
    rows.push(row);
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return { rows, totalDebit, totalCredit };
}

/** งบกำไรขาดทุน — income (credit−debit) − expense (debit−credit). */
export async function incomeStatement(
  db: SupabaseClient,
  orgId: string,
  opts?: { from?: string; to?: string },
): Promise<{
  income: { code: string; name: string; amount: number }[];
  expense: { code: string; name: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}> {
  const lines = await fetchPostedLines(db, orgId, opts);
  const incMap = new Map<string, { code: string; name: string; amount: number }>();
  const expMap = new Map<string, { code: string; name: string; amount: number }>();
  for (const l of lines) {
    if (l.account_type === "income") {
      const cur = incMap.get(l.account_id) ?? { code: l.code, name: l.name, amount: 0 };
      cur.amount += l.credit - l.debit;
      incMap.set(l.account_id, cur);
    } else if (l.account_type === "expense") {
      const cur = expMap.get(l.account_id) ?? { code: l.code, name: l.name, amount: 0 };
      cur.amount += l.debit - l.credit;
      expMap.set(l.account_id, cur);
    }
  }
  const income = Array.from(incMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  const expense = Array.from(expMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
  return { income, expense, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
}

/** งบแสดงฐานะการเงิน — asset / liability / equity (ยอดสะสมถึง to). */
export async function balanceSheet(
  db: SupabaseClient,
  orgId: string,
  opts?: { to?: string },
): Promise<{
  assets: { code: string; name: string; amount: number }[];
  liabilities: { code: string; name: string; amount: number }[];
  equity: { code: string; name: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}> {
  // balance sheet = ยอดสะสมตั้งแต่ต้น → ไม่ใส่ from
  const lines = await fetchPostedLines(db, orgId, { to: opts?.to });
  const aMap = new Map<string, { code: string; name: string; amount: number }>();
  const lMap = new Map<string, { code: string; name: string; amount: number }>();
  const eMap = new Map<string, { code: string; name: string; amount: number }>();
  for (const l of lines) {
    if (l.account_type === "asset") {
      const cur = aMap.get(l.account_id) ?? { code: l.code, name: l.name, amount: 0 };
      cur.amount += l.debit - l.credit;
      aMap.set(l.account_id, cur);
    } else if (l.account_type === "liability") {
      const cur = lMap.get(l.account_id) ?? { code: l.code, name: l.name, amount: 0 };
      cur.amount += l.credit - l.debit;
      lMap.set(l.account_id, cur);
    } else if (l.account_type === "equity") {
      const cur = eMap.get(l.account_id) ?? { code: l.code, name: l.name, amount: 0 };
      cur.amount += l.credit - l.debit;
      eMap.set(l.account_id, cur);
    }
  }
  const sortv = (m: Map<string, { code: string; name: string; amount: number }>) =>
    Array.from(m.values()).sort((a, b) => a.code.localeCompare(b.code));
  const assets = sortv(aMap);
  const liabilities = sortv(lMap);
  const equity = sortv(eMap);
  return {
    assets,
    liabilities,
    equity,
    totalAssets: assets.reduce((s, r) => s + r.amount, 0),
    totalLiabilities: liabilities.reduce((s, r) => s + r.amount, 0),
    totalEquity: equity.reduce((s, r) => s + r.amount, 0),
  };
}

/** บัญชีแยกประเภท (ledger) รายบัญชี — บรรทัด posted + running balance. */
export async function ledger(
  db: SupabaseClient,
  orgId: string,
  accountId: string,
  opts?: { from?: string; to?: string },
): Promise<{
  rows: {
    entry_date: string;
    entry_number: string;
    description: string | null;
    debit: number;
    credit: number;
    balance: number;
  }[];
}> {
  const { data, error } = await db
    .from("acc_journal_lines")
    .select(
      "debit, credit, line_note, acc_journal_entries!inner(entry_number, entry_date, description, status, org_id)",
    )
    .eq("org_id", orgId)
    .eq("account_id", accountId)
    .eq("acc_journal_entries.status", "posted")
    .eq("acc_journal_entries.org_id", orgId);
  if (error) throw new Error(error.message);

  let balance = 0;
  const rows = (data ?? [])
    .map((r: Record<string, unknown>) => {
      const je = r.acc_journal_entries as {
        entry_number?: string;
        entry_date?: string;
        description?: string | null;
      } | null;
      return {
        entry_date: je?.entry_date ?? "",
        entry_number: je?.entry_number ?? "",
        description: je?.description ?? null,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
      };
    })
    .filter(
      (r) => (!opts?.from || r.entry_date >= opts.from) && (!opts?.to || r.entry_date <= opts.to),
    )
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .map((r) => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });
  return { rows };
}
