import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolvePoaUnitPricePerWorker({
  supabase,
  repCode,
  poaRequestTypeId,
  fallbackUnitPrice,
}: {
  supabase: SupabaseClient;
  repCode: string | null | undefined;
  poaRequestTypeId: string | null | undefined;
  fallbackUnitPrice: number;
}): Promise<{ unit: number; source: "override" | "default" }> {
  const code = String(repCode ?? "").trim();
  const typeId = String(poaRequestTypeId ?? "").trim();
  const fallback = Number.isFinite(Number(fallbackUnitPrice)) ? Number(fallbackUnitPrice) : 0;
  if (!code || !typeId) return { unit: fallback, source: "default" };

  const { data, error } = await supabase
    .from("poa_request_type_rep_price_overrides")
    .select("unit_price_per_worker,active")
    .eq("rep_code", code)
    .eq("poa_request_type_id", typeId)
    .maybeSingle();

  if (error || !data) return { unit: fallback, source: "default" };
  if (!(data as any).active) return { unit: fallback, source: "default" };
  const unit = Number((data as any).unit_price_per_worker ?? NaN);
  if (!Number.isFinite(unit)) return { unit: fallback, source: "default" };
  return { unit, source: "override" };
}
