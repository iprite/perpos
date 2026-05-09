"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JournalLineInput = {
  accountId: string;
  contactId?: string | null;
  description?: string | null;
  debit: string;
  credit: string;
};

export async function createJournalEntryAction(params: {
  organizationId: string;
  entryDate: string;
  referenceNumber?: string | null;
  memo?: string | null;
  lines: JournalLineInput[];
}) {
  const supabase = await createSupabaseServerClient();

  const items = (params.lines ?? []).map((l) => ({
    account_id: String(l.accountId),
    contact_id: l.contactId ? String(l.contactId) : "",
    description: l.description ? String(l.description) : "",
    debit: String(l.debit ?? "0"),
    credit: String(l.credit ?? "0"),
  }));

  const { data, error } = await supabase.rpc("create_journal_entry", {
    p_organization_id: params.organizationId,
    p_entry_date: params.entryDate,
    p_reference_number: params.referenceNumber ?? "",
    p_memo: params.memo ?? "",
    p_items: items,
  });

  if (error) {
    const msg = error.message ?? "journal_create_failed";
    if (msg.includes("unbalanced_entry")) return { ok: false, error: "unbalanced" };
    if (msg.includes("invalid_items")) return { ok: false, error: "invalid_items" };
    if (msg.includes("not_member")) return { ok: false, error: "not_member" };
    return { ok: false, error: msg };
  }

  return { ok: true, journalEntryId: String(data) };
}
