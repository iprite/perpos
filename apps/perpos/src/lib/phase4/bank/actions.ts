"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadOrgFile } from "@/lib/phase4/storage";

export type BankImportRow = {
  id: string;
  bankName: string;
  bankAccountName: string;
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: string;
};

export type BankLineRow = {
  id: string;
  txnDate: string;
  description: string | null;
  amount: number;
  direction: "in" | "out";
  reference: string | null;
  matchedJournalEntryId: string | null;
};

export async function importBankStatementCsvAction(params: {
  organizationId: string;
  bankName: string;
  bankAccountName: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  file?: File;
  lines: Array<{ txn_date: string; description?: string; amount: number; direction: "in" | "out"; reference?: string; balance?: number }>;
}) {
  let sourcePath = "";
  if (params.file) {
    const objectPath = `${params.organizationId}/bank/${Date.now()}_${params.file.name}`;
    const up = await uploadOrgFile({
      organizationId: params.organizationId,
      bucket: "bank-statements",
      objectPath,
      file: params.file,
      contentType: params.file.type || "text/csv",
    });
    if (!up.ok) return up;
    sourcePath = up.path;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_bank_import_csv", {
    p_organization_id: params.organizationId,
    p_bank_name: params.bankName,
    p_bank_account_name: params.bankAccountName,
    p_period_from: params.periodFrom ?? null,
    p_period_to: params.periodTo ?? null,
    p_source_file_path: sourcePath,
    p_lines: params.lines,
  });
  if (error) return { ok: false as const, error: error.message ?? "import_failed" };
  return { ok: true as const, importId: String(data), sourcePath };
}

export async function listBankImportsAction(params: { organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bank_imports")
    .select("id,bank_name,bank_account_name,period_from,period_to,created_at")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };
  const rows: BankImportRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    bankName: String(r.bank_name),
    bankAccountName: String(r.bank_account_name),
    periodFrom: r.period_from ? String(r.period_from) : null,
    periodTo: r.period_to ? String(r.period_to) : null,
    createdAt: String(r.created_at),
  }));
  return { ok: true as const, rows };
}

export async function listBankLinesAction(params: { organizationId: string; bankImportId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bank_lines")
    .select("id,txn_date,description,amount,direction,reference")
    .eq("organization_id", params.organizationId)
    .eq("bank_import_id", params.bankImportId)
    .order("txn_date", { ascending: false })
    .limit(500);
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };

  const lineIds = (data ?? []).map((x: any) => String(x.id));
  const { data: matches } = lineIds.length
    ? await supabase
        .from("reconciliation_matches")
        .select("bank_line_id,journal_entry_id,status")
        .eq("organization_id", params.organizationId)
        .in("bank_line_id", lineIds)
        .eq("status", "confirmed")
    : { data: [] as any[] };
  const matchByLine = new Map<string, string>();
  for (const m of matches ?? []) matchByLine.set(String((m as any).bank_line_id), String((m as any).journal_entry_id));

  const rows: BankLineRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    txnDate: String(r.txn_date),
    description: r.description ? String(r.description) : null,
    amount: Number(r.amount ?? 0),
    direction: String(r.direction) as any,
    reference: r.reference ? String(r.reference) : null,
    matchedJournalEntryId: matchByLine.get(String(r.id)) ?? null,
  }));
  return { ok: true as const, rows };
}

export type SuggestRow = { journalEntryId: string; entryDate: string; memo: string | null; dayDiff: number };

export async function suggestReconciliationAction(params: { organizationId: string; bankLineId: string; limit: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_suggest_reconciliation", {
    p_organization_id: params.organizationId,
    p_bank_line_id: params.bankLineId,
    p_limit: params.limit,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };
  const rows: SuggestRow[] = (data ?? []).map((r: any) => ({
    journalEntryId: String(r.journal_entry_id),
    entryDate: String(r.entry_date),
    memo: r.memo ? String(r.memo) : null,
    dayDiff: Number(r.day_diff ?? 0),
  }));
  return { ok: true as const, rows };
}

export async function confirmReconciliationAction(params: { organizationId: string; bankLineId: string; journalEntryId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_confirm_reconciliation", {
    p_organization_id: params.organizationId,
    p_bank_line_id: params.bankLineId,
    p_journal_entry_id: params.journalEntryId,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };
  return { ok: true as const, matchId: String(data) };
}

export async function unreconcileBankLineAction(params: { organizationId: string; bankLineId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("rpc_unreconcile_bank_line", {
    p_organization_id: params.organizationId,
    p_bank_line_id: params.bankLineId,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };
  return { ok: true as const };
}

