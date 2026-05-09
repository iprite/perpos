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
