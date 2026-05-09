"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: "asset" | "liability" | "equity" | "income" | "expense" | string;
  parentAccountId: string | null;
  level: number;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export type PnlRow = {
  section: "revenue" | "expense" | string;
  accountId: string;
  accountCode: string;
  accountName: string;
  parentAccountId: string | null;
  level: number;
  amount: number;
};

export async function getTrialBalanceAction(params: {
  organizationId: string;
  startDate: string;
  endDate: string;
  postedOnly: boolean;
  includeClosing: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_trial_balance", {
    p_organization_id: params.organizationId,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_posted_only: params.postedOnly,
    p_include_closing: params.includeClosing,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };

  const rows: TrialBalanceRow[] = (data ?? []).map((r: any) => ({
    accountId: String(r.account_id),
    accountCode: String(r.account_code),
    accountName: String(r.account_name),
    accountType: String(r.account_type),
    parentAccountId: r.parent_account_id ? String(r.parent_account_id) : null,
    level: Number(r.level ?? 0),
    openingDebit: Number(r.opening_debit ?? 0),
    openingCredit: Number(r.opening_credit ?? 0),
    periodDebit: Number(r.period_debit ?? 0),
    periodCredit: Number(r.period_credit ?? 0),
    closingDebit: Number(r.closing_debit ?? 0),
    closingCredit: Number(r.closing_credit ?? 0),
  }));

  return { ok: true as const, rows };
}

export async function getPnlAction(params: {
  organizationId: string;
  startDate: string;
  endDate: string;
  postedOnly: boolean;
  includeClosing: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_pnl", {
    p_organization_id: params.organizationId,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_posted_only: params.postedOnly,
    p_include_closing: params.includeClosing,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };

  const rows: PnlRow[] = (data ?? []).map((r: any) => ({
    section: String(r.section),
    accountId: String(r.account_id),
    accountCode: String(r.account_code),
    accountName: String(r.account_name),
    parentAccountId: r.parent_account_id ? String(r.parent_account_id) : null,
    level: Number(r.level ?? 0),
    amount: Number(r.amount ?? 0),
  }));

  return { ok: true as const, rows };
}

export type LedgerLine = {
  entryDate: string;
  journalEntryId: string;
  lineNo: number;
  description: string | null;
  debit: number;
  credit: number;
};

export async function getAccountLedgerAction(params: {
  organizationId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  limit: number;
  offset: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("vw_gl_posted_items")
    .select("entry_date,journal_entry_id,line_no,description,debit,credit", { count: "exact" })
    .eq("organization_id", params.organizationId)
    .eq("account_id", params.accountId)
    .eq("status", "posted")
    .gte("entry_date", params.startDate)
    .lte("entry_date", params.endDate)
    .order("entry_date", { ascending: false })
    .order("line_no", { ascending: true })
    .range(params.offset, params.offset + params.limit - 1);
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };

  const rows: LedgerLine[] = (data ?? []).map((r: any) => ({
    entryDate: String(r.entry_date),
    journalEntryId: String(r.journal_entry_id),
    lineNo: Number(r.line_no ?? 0),
    description: r.description ? String(r.description) : null,
    debit: Number(r.debit ?? 0),
    credit: Number(r.credit ?? 0),
  }));

  return { ok: true as const, rows, count: Number(count ?? 0) };
}

export type ExecKpis = { revenue: number; expense: number; netProfit: number };
export type ExecTrendRow = { month: string; revenue: number; expense: number; netProfit: number };
export type TopExpenseRow = { label: string; amount: number };
export type AgingRow = { bucket: string; count: number; amount: number };

export async function getExecutiveDashboardAction(params: { organizationId: string; endMonth: string }) {
  const supabase = await createSupabaseServerClient();

  const [{ data: k, error: ke }, { data: t, error: te }, { data: top, error: tope }, { data: aging, error: ae }] =
    await Promise.all([
      supabase.rpc("rpc_exec_dashboard_kpis", { p_organization_id: params.organizationId, p_month: params.endMonth }),
      supabase.rpc("rpc_exec_dashboard_trends", { p_organization_id: params.organizationId, p_end_month: params.endMonth }),
      supabase.rpc("rpc_top_expenses", {
        p_organization_id: params.organizationId,
        p_start_date: params.endMonth.slice(0, 7) + "-01",
        p_end_date: params.endMonth,
        p_limit: 5,
      }),
      supabase.rpc("rpc_receivable_aging", { p_organization_id: params.organizationId, p_as_of: params.endMonth }),
    ]);

  if (ke) return { ok: false as const, error: ke.message };
  if (te) return { ok: false as const, error: te.message };
  if (tope) return { ok: false as const, error: tope.message };
  if (ae) return { ok: false as const, error: ae.message };

  const kpis: ExecKpis = {
    revenue: Number((k as any)?.[0]?.revenue ?? 0),
    expense: Number((k as any)?.[0]?.expense ?? 0),
    netProfit: Number((k as any)?.[0]?.net_profit ?? 0),
  };
  const trends: ExecTrendRow[] = (t ?? []).map((r: any) => ({
    month: String(r.month),
    revenue: Number(r.revenue ?? 0),
    expense: Number(r.expense ?? 0),
    netProfit: Number(r.net_profit ?? 0),
  }));
  const topExpenses: TopExpenseRow[] = (top ?? []).map((r: any) => ({ label: String(r.label), amount: Number(r.amount ?? 0) }));
  const receivableAging: AgingRow[] = (aging ?? []).map((r: any) => ({
    bucket: String(r.bucket),
    count: Number(r.count ?? 0),
    amount: Number(r.amount ?? 0),
  }));

  return { ok: true as const, kpis, trends, topExpenses, receivableAging };
}

export type OutputVatRow = {
  issueDate: string;
  invoiceNumber: string | null;
  customerName: string;
  customerTaxId: string | null;
  amount: number;
  vatAmount: number;
};

export async function getOutputVatReportAction(params: { organizationId: string; startDate: string; endDate: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vw_tax_output_vat")
    .select("issue_date,invoice_number,customer_name,customer_tax_id,amount,vat_amount")
    .eq("organization_id", params.organizationId)
    .gte("issue_date", params.startDate)
    .lte("issue_date", params.endDate)
    .order("issue_date", { ascending: false })
    .limit(500);
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };

  const rows: OutputVatRow[] = (data ?? []).map((r: any) => ({
    issueDate: String(r.issue_date),
    invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
    customerName: String(r.customer_name),
    customerTaxId: r.customer_tax_id ? String(r.customer_tax_id) : null,
    amount: Number(r.amount ?? 0),
    vatAmount: Number(r.vat_amount ?? 0),
  }));

  return { ok: true as const, rows };
}

export async function getWhtSummaryAction(params: { organizationId: string; startDate: string; endDate: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_wht_summary", {
    p_organization_id: params.organizationId,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };

  const row = (data as any)?.[0] ?? null;
  return {
    ok: true as const,
    count: Number(row?.count ?? 0),
    totalWithholding: Number(row?.total_withholding ?? 0),
  };
}

