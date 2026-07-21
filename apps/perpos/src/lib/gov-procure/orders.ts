// lib/gov-procure/orders.ts — fetch logic (reuse SSR page + API route)
// รับ Supabase client เข้ามา (RLS client สำหรับ SSR / admin client สำหรับ route) — กรอง org_id เสมอ

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovProcureOrder } from "./types";

/** list orders ของ org — เรียงตาม seq_no (ตาม §6) */
export async function listOrders(
  client: SupabaseClient,
  orgId: string,
): Promise<GovProcureOrder[]> {
  const { data, error } = await client
    .from("gov_procure_orders")
    .select("*")
    .eq("org_id", orgId)
    .order("seq_no", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as GovProcureOrder[];
}

/** single order (กรอง org_id ป้องกัน cross-org) — null ถ้าไม่พบ */
export async function getOrder(
  client: SupabaseClient,
  orgId: string,
  id: string,
): Promise<GovProcureOrder | null> {
  const { data, error } = await client
    .from("gov_procure_orders")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as GovProcureOrder | null) ?? null;
}
