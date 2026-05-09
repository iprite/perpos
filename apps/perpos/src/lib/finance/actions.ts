"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateFinanceAccountInput = {
  organizationId: string;
  accountCategory: "petty_cash" | "bank" | "payment_channel" | "reserve";
  name: string;
  linkedAccountId?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  branch?: string | null;
  bankAccountType?: "current" | "savings" | "fixed" | null;
  channelType?: "cash" | "bank_transfer" | "qr_promptpay" | "credit_card" | "other" | null;
  custodianName?: string | null;
  purpose?: string | null;
  initialBalance?: number;
  notes?: string | null;
};

export async function createFinanceAccountAction(input: CreateFinanceAccountInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("finance_accounts")
    .insert({
      organization_id:   input.organizationId,
      account_category:  input.accountCategory,
      name:              input.name.trim(),
      linked_account_id: input.linkedAccountId  ?? null,
      bank_name:         input.bankName          ?? null,
      account_number:    input.accountNumber     ?? null,
      branch:            input.branch            ?? null,
      bank_account_type: input.bankAccountType   ?? null,
      channel_type:      input.channelType       ?? null,
      custodian_name:    input.custodianName     ?? null,
      purpose:           input.purpose           ?? null,
      initial_balance:   input.initialBalance    ?? 0,
      notes:             input.notes             ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: String(data.id) };
}

export async function updateFinanceAccountAction(
  id: string,
  organizationId: string,
  patch: Partial<CreateFinanceAccountInput>,
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("finance_accounts")
    .update({
      ...(patch.name              !== undefined ? { name:              patch.name?.trim() }         : {}),
      ...(patch.linkedAccountId   !== undefined ? { linked_account_id: patch.linkedAccountId }      : {}),
      ...(patch.bankName          !== undefined ? { bank_name:         patch.bankName }              : {}),
      ...(patch.accountNumber     !== undefined ? { account_number:    patch.accountNumber }         : {}),
      ...(patch.branch            !== undefined ? { branch:            patch.branch }                : {}),
      ...(patch.bankAccountType   !== undefined ? { bank_account_type: patch.bankAccountType }      : {}),
      ...(patch.channelType       !== undefined ? { channel_type:      patch.channelType }           : {}),
      ...(patch.custodianName     !== undefined ? { custodian_name:    patch.custodianName }         : {}),
      ...(patch.purpose           !== undefined ? { purpose:           patch.purpose }               : {}),
      ...(patch.initialBalance    !== undefined ? { initial_balance:   patch.initialBalance }        : {}),
      ...(patch.notes             !== undefined ? { notes:             patch.notes }                 : {}),
    })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function toggleFinanceAccountActiveAction(id: string, organizationId: string, isActive: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("finance_accounts")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export type CreateCheckTransactionInput = {
  organizationId: string;
  txnType: "deposit" | "payment";
  checkNumber: string;
  bankName?: string | null;
  checkDate: string;
  dueDate?: string | null;
  amount: number;
  contactId?: string | null;
  financeAccountId?: string | null;
  notes?: string | null;
};

export async function createCheckTransactionAction(input: CreateCheckTransactionInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("check_transactions")
    .insert({
      organization_id:    input.organizationId,
      txn_type:           input.txnType,
      check_number:       input.checkNumber.trim(),
      bank_name:          input.bankName          ?? null,
      check_date:         input.checkDate,
      due_date:           input.dueDate           ?? null,
      amount:             input.amount,
      contact_id:         input.contactId         ?? null,
      finance_account_id: input.financeAccountId  ?? null,
      notes:              input.notes             ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: String(data.id) };
}

export async function updateCheckTransactionStatusAction(
  id: string,
  organizationId: string,
  status: "pending" | "cleared" | "bounced" | "voided",
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("check_transactions")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
