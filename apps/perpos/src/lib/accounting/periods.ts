/**
 * periods.ts — fetch logic งวดบัญชี/ปิดงวด (acc_periods).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccPeriod } from "./types";

export async function listPeriods(
  db: SupabaseClient,
  orgId: string,
  opts?: { year?: number },
): Promise<AccPeriod[]> {
  let q = db.from("acc_periods").select("*").eq("org_id", orgId);
  if (opts?.year) q = q.eq("year", opts.year);
  q = q.order("year", { ascending: false }).order("month", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AccPeriod[];
}

export async function getPeriod(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccPeriod | null> {
  const { data, error } = await db
    .from("acc_periods")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccPeriod) ?? null;
}
