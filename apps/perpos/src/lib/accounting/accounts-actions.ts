"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountUpsertInput = {
  id?: string;
  organizationId: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  normalBalance: "debit" | "credit";
  parentAccountId?: string | null;
  description?: string | null;
};

export async function upsertAccountAction(input: AccountUpsertInput) {
  const supabase = await createSupabaseServerClient();

  const payload: any = {
    organization_id: input.organizationId,
    code: String(input.code ?? "").trim(),
    name: String(input.name ?? "").trim(),
    type: input.type,
    normal_balance: input.normalBalance,
    parent_account_id: input.parentAccountId ? String(input.parentAccountId) : null,
    description: input.description ? String(input.description).trim() : null,
  };

  if (!payload.organization_id || !payload.code || !payload.name) {
    return { ok: false, error: "missing_required_fields" };
  }

  const q = input.id
    ? supabase.from("accounts").update(payload).eq("id", input.id).select("id").single()
    : supabase.from("accounts").insert(payload).select("id").single();

  const { data, error } = await q;
  if (error) {
    const msg = error.message ?? "account_write_failed";
    if ((error as any).code === "23505") return { ok: false, error: "duplicate_code" };
    return { ok: false, error: msg };
  }

  return { ok: true, id: String((data as any).id) };
}

export async function setAccountActiveAction(params: { id: string; organizationId: string; isActive: boolean }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_active: params.isActive })
    .eq("id", params.id)
    .eq("organization_id", params.organizationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
