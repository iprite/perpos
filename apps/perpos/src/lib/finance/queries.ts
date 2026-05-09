import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";

export type FinanceAccountRow = {
  id: string;
  organizationId: string;
  accountCategory: "petty_cash" | "bank" | "payment_channel" | "reserve";
  name: string;
  linkedAccountId: string | null;
  bankName: string | null;
  accountNumber: string | null;
  branch: string | null;
  bankAccountType: "current" | "savings" | "fixed" | null;
  channelType: "cash" | "bank_transfer" | "qr_promptpay" | "credit_card" | "other" | null;
  custodianName: string | null;
  purpose: string | null;
  initialBalance: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
};

export type CheckTransactionRow = {
  id: string;
  organizationId: string;
  txnType: "deposit" | "payment";
  checkNumber: string;
  bankName: string | null;
  checkDate: string;
  dueDate: string | null;
  amount: number;
  contactName: string | null;
  financeAccountId: string | null;
  financeAccountName: string | null;
  status: "pending" | "cleared" | "bounced" | "voided";
  notes: string | null;
  createdAt: string;
};

export async function fetchFinanceAccounts(
  category: FinanceAccountRow["accountCategory"],
): Promise<{ rows: FinanceAccountRow[]; error: string | null }> {
  const activeOrganizationId = await getActiveOrganizationId();
  if (!activeOrganizationId) return { rows: [], error: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("finance_accounts")
    .select("id,organization_id,account_category,name,linked_account_id,bank_name,account_number,branch,bank_account_type,channel_type,custodian_name,purpose,initial_balance,is_active,notes,created_at")
    .eq("organization_id", activeOrganizationId)
    .eq("account_category", category)
    .order("created_at", { ascending: false });

  if (error) return { rows: [], error: error.message };

  const rows: FinanceAccountRow[] = (data ?? []).map((r: any) => ({
    id:               String(r.id),
    organizationId:   String(r.organization_id),
    accountCategory:  r.account_category,
    name:             String(r.name),
    linkedAccountId:  r.linked_account_id ? String(r.linked_account_id) : null,
    bankName:         r.bank_name         ?? null,
    accountNumber:    r.account_number    ?? null,
    branch:           r.branch            ?? null,
    bankAccountType:  r.bank_account_type ?? null,
    channelType:      r.channel_type      ?? null,
    custodianName:    r.custodian_name    ?? null,
    purpose:          r.purpose           ?? null,
    initialBalance:   Number(r.initial_balance ?? 0),
    isActive:         Boolean(r.is_active),
    notes:            r.notes             ?? null,
    createdAt:        String(r.created_at),
  }));

  return { rows, error: null };
}

export async function fetchCheckTransactions(
  txnType: "deposit" | "payment",
): Promise<{ rows: CheckTransactionRow[]; error: string | null }> {
  const activeOrganizationId = await getActiveOrganizationId();
  if (!activeOrganizationId) return { rows: [], error: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("check_transactions")
    .select("id,organization_id,txn_type,check_number,bank_name,check_date,due_date,amount,contact_id,finance_account_id,status,notes,created_at")
    .eq("organization_id", activeOrganizationId)
    .eq("txn_type", txnType)
    .order("check_date", { ascending: false })
    .limit(200);

  if (error) return { rows: [], error: error.message };

  const contactIds = Array.from(new Set((data ?? []).filter((r: any) => r.contact_id).map((r: any) => String(r.contact_id))));
  const financeAccountIds = Array.from(new Set((data ?? []).filter((r: any) => r.finance_account_id).map((r: any) => String(r.finance_account_id))));

  const [{ data: contacts }, { data: financeAccounts }] = await Promise.all([
    contactIds.length
      ? supabase.from("contacts").select("id,name").in("id", contactIds)
      : Promise.resolve({ data: [] as any[] }),
    financeAccountIds.length
      ? supabase.from("finance_accounts").select("id,name").in("id", financeAccountIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const contactNameById = new Map<string, string>();
  for (const c of contacts ?? []) contactNameById.set(String((c as any).id), String((c as any).name));

  const accountNameById = new Map<string, string>();
  for (const a of financeAccounts ?? []) accountNameById.set(String((a as any).id), String((a as any).name));

  const rows: CheckTransactionRow[] = (data ?? []).map((r: any) => ({
    id:                String(r.id),
    organizationId:    String(r.organization_id),
    txnType:           r.txn_type,
    checkNumber:       String(r.check_number),
    bankName:          r.bank_name  ?? null,
    checkDate:         String(r.check_date),
    dueDate:           r.due_date   ?? null,
    amount:            Number(r.amount ?? 0),
    contactName:       r.contact_id         ? (contactNameById.get(String(r.contact_id)) ?? null) : null,
    financeAccountId:  r.finance_account_id ? String(r.finance_account_id) : null,
    financeAccountName: r.finance_account_id ? (accountNameById.get(String(r.finance_account_id)) ?? null) : null,
    status:            r.status,
    notes:             r.notes     ?? null,
    createdAt:         String(r.created_at),
  }));

  return { rows, error: null };
}

export async function fetchFinancePageData() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let contacts: Array<{ id: string; label: string }> = [];
  let financeAccounts: Array<{ id: string; label: string; category: string }> = [];
  let chartAccounts: Array<{ id: string; label: string }> = [];

  if (activeOrganizationId) {
    const [{ data: cs }, { data: fa }, { data: ca }] = await Promise.all([
      supabase
        .from("contacts")
        .select("id,name")
        .eq("organization_id", activeOrganizationId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("finance_accounts")
        .select("id,name,account_category")
        .eq("organization_id", activeOrganizationId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("accounts")
        .select("id,code,name")
        .eq("organization_id", activeOrganizationId)
        .eq("is_active", true)
        .order("code", { ascending: true })
        .limit(500),
    ]);

    contacts = (cs ?? []).map((c: any) => ({ id: String(c.id), label: String(c.name) }));
    financeAccounts = (fa ?? []).map((a: any) => ({
      id: String(a.id),
      label: String(a.name),
      category: String(a.account_category),
    }));
    chartAccounts = (ca ?? []).map((a: any) => ({
      id: String(a.id),
      label: `${String(a.code)} ${String(a.name)}`,
    }));
  }

  return { activeOrganizationId, contacts, financeAccounts, chartAccounts };
}
