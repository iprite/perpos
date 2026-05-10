"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AssetRow = {
  id: string;
  organization_id: string;
  asset_code: string;
  name: string;
  asset_type: string;
  purchase_date: string | null;
  cost: number;
  residual_value: number;
  useful_life_months: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  asset_account_id: string | null;
  depreciation_account_id: string | null;
  accum_depr_account_id: string | null;
  disposal_date: string | null;
  disposal_amount: number | null;
  notes: string | null;
  status: "active" | "disposed" | "idle";
};

export async function listAssetsAction(params: { organizationId: string }): Promise<
  { ok: true; rows: AssetRow[] } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", params.organizationId)
    .order("asset_code");
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data as AssetRow[] };
}

export async function upsertAssetAction(params: {
  organizationId: string;
  id?: string;
  asset_code: string;
  name: string;
  asset_type: string;
  purchase_date: string | null;
  cost: number;
  residual_value: number;
  useful_life_months: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  notes: string | null;
  status: AssetRow["status"];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const payload = {
    organization_id:         params.organizationId,
    asset_code:              params.asset_code,
    name:                    params.name,
    asset_type:              params.asset_type,
    purchase_date:           params.purchase_date,
    cost:                    params.cost,
    residual_value:          params.residual_value,
    useful_life_months:      params.useful_life_months,
    depreciation_method:     params.depreciation_method,
    accumulated_depreciation: params.accumulated_depreciation,
    notes:                   params.notes,
    status:                  params.status,
    updated_at:              new Date().toISOString(),
  };

  let id: string;
  if (params.id) {
    const { error } = await supabase
      .from("fixed_assets")
      .update(payload)
      .eq("id", params.id)
      .eq("organization_id", params.organizationId);
    if (error) return { ok: false, error: error.message };
    id = params.id;
  } else {
    const { data, error } = await supabase
      .from("fixed_assets")
      .insert(payload)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id;
  }

  revalidatePath("/assets");
  return { ok: true, id };
}

export async function disposeAssetAction(params: {
  organizationId: string;
  id: string;
  disposal_date: string;
  disposal_amount: number;
  notes: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("fixed_assets")
    .update({
      status:          "disposed",
      disposal_date:   params.disposal_date,
      disposal_amount: params.disposal_amount,
      notes:           params.notes,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("organization_id", params.organizationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}
