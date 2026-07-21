/**
 * entries.ts — fetch logic รายรับ/รายจ่าย cockpit (acc_entries).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccEntry, AccEntrySummary } from "./types";

export interface ListEntriesOpts {
  kind?: string;
  category?: string;
  from?: string;
  to?: string;
  contactId?: string;
}

export async function listEntries(
  db: SupabaseClient,
  orgId: string,
  opts?: ListEntriesOpts,
): Promise<AccEntry[]> {
  let q = db.from("acc_entries").select("*, acc_contacts(name)").eq("org_id", orgId);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.contactId) q = q.eq("contact_id", opts.contactId);
  if (opts?.from) q = q.gte("entry_date", opts.from);
  if (opts?.to) q = q.lte("entry_date", opts.to);
  q = q.order("entry_date", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as AccEntry),
    contact_name: (r.acc_contacts as { name?: string } | null)?.name ?? undefined,
  }));
}

export async function getEntry(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccEntry | null> {
  const { data, error } = await db
    .from("acc_entries")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccEntry) ?? null;
}

/** สรุปรายรับ/รายจ่าย (dashboard StatCard). */
export function summarizeEntries(entries: AccEntry[]): AccEntrySummary {
  let total_income = 0;
  let total_expense = 0;
  let income_count = 0;
  let expense_count = 0;
  for (const e of entries) {
    if (e.kind === "income") {
      total_income += Number(e.amount) || 0;
      income_count++;
    } else {
      total_expense += Number(e.amount) || 0;
      expense_count++;
    }
  }
  return {
    total_income,
    total_expense,
    net: total_income - total_expense,
    income_count,
    expense_count,
  };
}
