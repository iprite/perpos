/**
 * accounts.ts — fetch logic ผังบัญชี (acc_accounts).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccAccount } from "./types";

export async function listAccounts(
  db: SupabaseClient,
  orgId: string,
  opts?: { activeOnly?: boolean; accountType?: string },
): Promise<AccAccount[]> {
  let q = db.from("acc_accounts").select("*").eq("org_id", orgId);
  if (opts?.activeOnly) q = q.eq("is_active", true);
  if (opts?.accountType) q = q.eq("account_type", opts.accountType);
  q = q.order("code", { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AccAccount[];
}

export async function getAccount(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccAccount | null> {
  const { data, error } = await db
    .from("acc_accounts")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccAccount) ?? null;
}

/** หา account id จาก code (ใช้ใน bridge/depreciation fallback). คืน null ถ้าไม่เจอ. */
export async function findAccountIdByCode(
  db: SupabaseClient,
  orgId: string,
  code: string,
): Promise<string | null> {
  const { data } = await db
    .from("acc_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("code", code)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
