// reports.ts — คำนวณงบการเงินจาก journal posted lines + accounts (mock prototype)
// trial balance / income statement / balance sheet / ledger รายบัญชี
// ทุกตัวคำนวณจาก fixture จริง (ไม่แต่งเลข)

import type { AccAccount, AccJournalEntry, AccAccountType } from "../_fixtures/types";

export interface AccountBalance {
  account_id: string;
  code: string;
  name: string;
  account_type: AccAccountType;
  debit: number; // ยอดเดบิตรวม
  credit: number; // ยอดเครดิตรวม
  balance: number; // ยอดคงเหลือตามธรรมชาติของบัญชี (asset/expense = Dr−Cr, อื่น = Cr−Dr)
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ปีงวด helper — filter posted entries ตามช่วงเดือน (year, ถึง month inclusive ถ้าระบุ) */
function inPeriod(entry: AccJournalEntry, year: number, month: number | null): boolean {
  const d = new Date(entry.entry_date);
  if (d.getFullYear() !== year) return false;
  if (month != null && d.getMonth() + 1 > month) return false;
  return true;
}

/** รวมยอด Dr/Cr ต่อบัญชี จาก posted journal lines ในงวด */
export function computeAccountBalances(
  accounts: AccAccount[],
  journal: AccJournalEntry[],
  year: number,
  month: number | null,
): AccountBalance[] {
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const agg = new Map<string, { debit: number; credit: number }>();

  for (const j of journal) {
    if (j.status !== "posted") continue;
    if (!inPeriod(j, year, month)) continue;
    for (const l of j.lines ?? []) {
      const cur = agg.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += l.debit;
      cur.credit += l.credit;
      agg.set(l.account_id, cur);
    }
  }

  const out: AccountBalance[] = [];
  for (const [accId, sums] of Array.from(agg.entries())) {
    const acc = accById.get(accId);
    if (!acc) continue;
    const isDebitNature = acc.account_type === "asset" || acc.account_type === "expense";
    const balance = isDebitNature
      ? round2(sums.debit - sums.credit)
      : round2(sums.credit - sums.debit);
    out.push({
      account_id: accId,
      code: acc.code,
      name: acc.name,
      account_type: acc.account_type,
      debit: round2(sums.debit),
      credit: round2(sums.credit),
      balance,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  debit: number; // ยอดที่แสดงคอลัมน์เดบิต (ถ้าบัญชีคงเหลือฝั่ง Dr)
  credit: number;
}
export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export function buildTrialBalance(balances: AccountBalance[]): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const b of balances) {
    if (Math.abs(b.balance) < 0.001) continue;
    const isDebitNature = b.account_type === "asset" || b.account_type === "expense";
    // ยอดคงเหลือบวก → ฝั่งธรรมชาติ; ลบ → ฝั่งตรงข้าม
    let dr = 0;
    let cr = 0;
    if (isDebitNature) {
      if (b.balance >= 0) dr = b.balance;
      else cr = -b.balance;
    } else {
      if (b.balance >= 0) cr = b.balance;
      else dr = -b.balance;
    }
    totalDebit += dr;
    totalCredit += cr;
    rows.push({ code: b.code, name: b.name, debit: dr, credit: cr });
  }
  return {
    rows,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    balanced: Math.abs(round2(totalDebit - totalCredit)) < 0.001,
  };
}

export interface IncomeStatement {
  incomeRows: AccountBalance[];
  expenseRows: AccountBalance[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}

export function buildIncomeStatement(balances: AccountBalance[]): IncomeStatement {
  const incomeRows = balances.filter(
    (b) => b.account_type === "income" && Math.abs(b.balance) >= 0.001,
  );
  const expenseRows = balances.filter(
    (b) => b.account_type === "expense" && Math.abs(b.balance) >= 0.001,
  );
  const totalIncome = round2(incomeRows.reduce((s, b) => s + b.balance, 0));
  const totalExpense = round2(expenseRows.reduce((s, b) => s + b.balance, 0));
  return {
    incomeRows,
    expenseRows,
    totalIncome,
    totalExpense,
    netProfit: round2(totalIncome - totalExpense),
  };
}

export interface BalanceSheet {
  assetRows: AccountBalance[];
  liabilityRows: AccountBalance[];
  equityRows: AccountBalance[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netProfit: number; // กำไรสะสมงวด (เพิ่มในส่วนของเจ้าของ)
  totalLiabEquity: number;
  balanced: boolean;
}

export function buildBalanceSheet(balances: AccountBalance[], netProfit: number): BalanceSheet {
  const assetRows = balances.filter(
    (b) => b.account_type === "asset" && Math.abs(b.balance) >= 0.001,
  );
  const liabilityRows = balances.filter(
    (b) => b.account_type === "liability" && Math.abs(b.balance) >= 0.001,
  );
  const equityRows = balances.filter(
    (b) => b.account_type === "equity" && Math.abs(b.balance) >= 0.001,
  );
  const totalAssets = round2(assetRows.reduce((s, b) => s + b.balance, 0));
  const totalLiabilities = round2(liabilityRows.reduce((s, b) => s + b.balance, 0));
  const totalEquity = round2(equityRows.reduce((s, b) => s + b.balance, 0));
  const totalLiabEquity = round2(totalLiabilities + totalEquity + netProfit);
  return {
    assetRows,
    liabilityRows,
    equityRows,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netProfit,
    totalLiabEquity,
    balanced: Math.abs(round2(totalAssets - totalLiabEquity)) < 0.001,
  };
}

export interface LedgerEntry {
  date: string;
  entry_number: string;
  description: string;
  debit: number;
  credit: number;
  running: number;
}
export interface Ledger {
  account: AccAccount | null;
  rows: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

export function buildLedger(
  accountId: string,
  accounts: AccAccount[],
  journal: AccJournalEntry[],
  year: number,
  month: number | null,
): Ledger {
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const isDebitNature = account?.account_type === "asset" || account?.account_type === "expense";
  const movements: Array<Omit<LedgerEntry, "running">> = [];
  for (const j of journal) {
    if (j.status !== "posted") continue;
    if (!inPeriod(j, year, month)) continue;
    for (const l of j.lines ?? []) {
      if (l.account_id !== accountId) continue;
      movements.push({
        date: j.entry_date,
        entry_number: j.entry_number,
        description: j.description ?? l.line_note ?? "",
        debit: l.debit,
        credit: l.credit,
      });
    }
  }
  movements.sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const rows: LedgerEntry[] = movements.map((m) => {
    running += isDebitNature ? m.debit - m.credit : m.credit - m.debit;
    return { ...m, running: round2(running) };
  });
  return {
    account,
    rows,
    totalDebit: round2(movements.reduce((s, m) => s + m.debit, 0)),
    totalCredit: round2(movements.reduce((s, m) => s + m.credit, 0)),
    closing: round2(running),
  };
}
