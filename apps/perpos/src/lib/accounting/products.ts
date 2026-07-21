/**
 * products.ts — fetch logic สินค้า/บริการ (acc_products catalog).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccProduct } from "./types";

export async function listProducts(
  db: SupabaseClient,
  orgId: string,
  opts?: { kind?: string; activeOnly?: boolean; search?: string },
): Promise<AccProduct[]> {
  let q = db.from("acc_products").select("*").eq("org_id", orgId);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (opts?.activeOnly) q = q.eq("is_active", true);
  if (opts?.search) q = q.ilike("name", `%${opts.search}%`);
  q = q.order("name", { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AccProduct[];
}

export async function getProduct(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccProduct | null> {
  const { data, error } = await db
    .from("acc_products")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccProduct) ?? null;
}
