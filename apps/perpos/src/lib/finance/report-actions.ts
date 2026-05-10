"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BalanceSheetRow = {
  section: string;
  account_id: string;
  account_code: string;
  account_name: string;
  parent_account_id: string | null;
  level: number;
  balance: number;
};

export type LedgerRow = {
  journal_entry_id: string;
  entry_date: string;
  reference_number: string | null;
  memo: string | null;
  description: string | null;
  debit: number;
  credit: number;
  running_balance: number;
};

export async function getBalanceSheetAction(
  organizationId: string,
  asOfDate: string,
): Promise<{ rows: BalanceSheetRow[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_balance_sheet", {
    p_organization_id: organizationId,
    p_as_of_date: asOfDate,
    p_posted_only: true,
  });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as BalanceSheetRow[], error: null };
}

export type CashFlowRow = {
  section: "operating" | "investing" | "financing" | string;
  label: string;
  amount: number;
  sortOrder: number;
};

export type WhtReceivedRow = {
  id: string;
  docNumber: string;
  docType: string;
  issueDate: string;
  contactName: string;
  totalAmount: number;
  withholdingTax: number;
};

export async function getCashFlowAction(
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ rows: CashFlowRow[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_cash_flow_indirect", {
    p_organization_id: organizationId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_posted_only: true,
  });
  if (error) return { rows: [], error: error.message };
  const rows: CashFlowRow[] = (data ?? []).map((r: any) => ({
    section:   String(r.section),
    label:     String(r.label),
    amount:    Number(r.amount ?? 0),
    sortOrder: Number(r.sort_order ?? 0),
  }));
  return { rows, error: null };
}

export async function getWhtReceivedAction(
  organizationId: string,
  startDate?: string,
  endDate?: string,
): Promise<{ rows: WhtReceivedRow[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_wht_received", {
    p_organization_id: organizationId,
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  });
  if (error) return { rows: [], error: error.message };
  const rows: WhtReceivedRow[] = (data ?? []).map((r: any) => ({
    id:             String(r.id),
    docNumber:      String(r.doc_number),
    docType:        String(r.doc_type),
    issueDate:      String(r.issue_date),
    contactName:    String(r.contact_name ?? ""),
    totalAmount:    Number(r.total_amount ?? 0),
    withholdingTax: Number(r.withholding_tax ?? 0),
  }));
  return { rows, error: null };
}

export async function getGeneralLedgerAction(
  organizationId: string,
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<{ rows: LedgerRow[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_general_ledger", {
    p_organization_id: organizationId,
    p_account_id: accountId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_posted_only: true,
  });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as LedgerRow[], error: null };
}
