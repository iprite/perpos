/**
 * journal.ts — fetch logic สมุดรายวัน (acc_journal_entries + acc_journal_lines nested).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccJournalEntry, AccJournalLine } from "./types";

export interface ListJournalOpts {
  status?: string;
  source?: string;
  from?: string;
  to?: string;
}

export async function listJournalEntries(
  db: SupabaseClient,
  orgId: string,
  opts?: ListJournalOpts,
): Promise<AccJournalEntry[]> {
  let q = db.from("acc_journal_entries").select("*").eq("org_id", orgId);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.source) q = q.eq("source", opts.source);
  if (opts?.from) q = q.gte("entry_date", opts.from);
  if (opts?.to) q = q.lte("entry_date", opts.to);
  q = q.order("entry_date", { ascending: false }).order("entry_number", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AccJournalEntry[];
}

/** journal entry 1 ใบ + lines (join account code/name, เรียง sort_order). */
export async function getJournalEntry(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccJournalEntry | null> {
  const { data: entry, error } = await db
    .from("acc_journal_entries")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!entry) return null;

  const { data: lines, error: e2 } = await db
    .from("acc_journal_lines")
    .select("*, acc_accounts(code, name)")
    .eq("org_id", orgId)
    .eq("journal_entry_id", id)
    .order("sort_order", { ascending: true });
  if (e2) throw new Error(e2.message);

  const decorated = (lines ?? []).map((l: Record<string, unknown>) => ({
    ...(l as unknown as AccJournalLine),
    account_code: (l.acc_accounts as { code?: string } | null)?.code ?? undefined,
    account_name: (l.acc_accounts as { name?: string } | null)?.name ?? undefined,
  }));

  return { ...(entry as AccJournalEntry), lines: decorated };
}
