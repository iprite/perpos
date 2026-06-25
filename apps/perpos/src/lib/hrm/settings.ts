/**
 * settings.ts — fetch logic หน้าตั้งค่า (pay_items / funds / account_settings + leave_types).
 * RLS-scoped client · caller เช็ค auth ก่อน · ทุก query filter org_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayItem, Fund, AccountSetting } from "@/lib/hrm/types";

export async function listPayItems(
  db: SupabaseClient,
  orgId: string,
  opts?: { activeOnly?: boolean },
): Promise<PayItem[]> {
  let q = db
    .from("hrm_pay_items")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (opts?.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PayItem[];
}

export async function listFunds(
  db: SupabaseClient,
  orgId: string,
  opts?: { activeOnly?: boolean },
): Promise<Fund[]> {
  let q = db
    .from("hrm_funds")
    .select("*")
    .eq("org_id", orgId)
    .order("fund_type", { ascending: true });
  if (opts?.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Fund[];
}

export async function listAccountSettings(
  db: SupabaseClient,
  orgId: string,
): Promise<AccountSetting[]> {
  const { data, error } = await db
    .from("hrm_account_settings")
    .select("*")
    .eq("org_id", orgId)
    .order("setting_key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountSetting[];
}
