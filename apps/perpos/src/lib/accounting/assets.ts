/**
 * assets.ts — fetch logic ทะเบียนสินทรัพย์ + ค่าเสื่อม (acc_assets).
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccAsset } from "./types";

/** ค่าเสื่อมต่อเดือน (เส้นตรง) = (cost − salvage) / useful_life_months */
export function monthlyDepreciation(
  asset: Pick<AccAsset, "cost" | "salvage_value" | "useful_life_months">,
): number {
  const base = Number(asset.cost) - Number(asset.salvage_value);
  const life = Number(asset.useful_life_months);
  if (!Number.isFinite(base) || !Number.isFinite(life) || life <= 0) return 0;
  return Math.round((base / life + Number.EPSILON) * 100) / 100;
}

function decorate(a: AccAsset): AccAsset {
  return {
    ...a,
    book_value: Number(a.cost) - Number(a.accumulated_depreciation),
    monthly_depreciation: monthlyDepreciation(a),
  };
}

export async function listAssets(
  db: SupabaseClient,
  orgId: string,
  opts?: { status?: string },
): Promise<AccAsset[]> {
  let q = db
    .from("acc_assets")
    .select("*, acc_accounts!acc_assets_asset_account_id_fkey(name)")
    .eq("org_id", orgId);
  if (opts?.status) q = q.eq("status", opts.status);
  q = q.order("acquire_date", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...decorate(r as unknown as AccAsset),
    asset_account_name: (r.acc_accounts as { name?: string } | null)?.name ?? undefined,
  }));
}

export async function getAsset(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccAsset | null> {
  const { data, error } = await db
    .from("acc_assets")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? decorate(data as AccAsset) : null;
}
