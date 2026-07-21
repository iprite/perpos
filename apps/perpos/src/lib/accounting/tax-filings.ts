/**
 * tax-filings.ts — fetch logic แบบภาษี PP30/PND (acc_tax_filings).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccTaxFiling } from "./types";

export async function listTaxFilings(
  db: SupabaseClient,
  orgId: string,
  opts?: { taxKind?: string; status?: string; year?: number },
): Promise<AccTaxFiling[]> {
  let q = db.from("acc_tax_filings").select("*").eq("org_id", orgId);
  if (opts?.taxKind) q = q.eq("tax_kind", opts.taxKind);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.year) q = q.eq("period_year", opts.year);
  q = q.order("period_year", { ascending: false }).order("period_month", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AccTaxFiling[];
}

export async function getTaxFiling(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccTaxFiling | null> {
  const { data, error } = await db
    .from("acc_tax_filings")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccTaxFiling) ?? null;
}
