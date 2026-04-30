"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPoaPdfBytes } from "@/components/poa/poa-pdf";
import type { PoaRequestRow } from "@/components/poa/poa-types";
import type { CompanyRepRow, TypeOption } from "./poa-request-create-form";
import { resolvePoaUnitPricePerWorker } from "./poa-pricing";

function repDisplayName(r: CompanyRepRow | null) {
  if (!r) return null;
  const full = `${r.prefix ?? ""}${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  return full || null;
}

export async function createPoaRequestAndMaybePdf({
  supabase,
  rep,
  type,
  isOperationContext,
  isMouSelected,
  employerName,
  employerTaxId,
  employerTel,
  employerType,
  employerAddress,
  workerCount,
  workerMale,
  workerFemale,
  workerNation,
  workerType,
}: {
  supabase: SupabaseClient;
  rep: CompanyRepRow;
  type: TypeOption;
  isOperationContext: boolean;
  isMouSelected: boolean;
  employerName: string;
  employerTaxId: string;
  employerTel: string;
  employerType: string;
  employerAddress: string;
  workerCount: string;
  workerMale: string;
  workerFemale: string;
  workerNation: string;
  workerType: string;
}) {
  const maleNum = isMouSelected && workerMale.trim().length ? Math.max(0, Math.trunc(Number(workerMale))) : 0;
  const femaleNum = isMouSelected && workerFemale.trim().length ? Math.max(0, Math.trunc(Number(workerFemale))) : 0;
  const wc = isMouSelected ? Math.max(1, maleNum + femaleNum) : Math.max(1, Math.trunc(Number(workerCount || 1)));
  const male = isMouSelected && workerMale.trim().length ? Math.max(0, Math.trunc(Number(workerMale))) : null;
  const female = isMouSelected && workerFemale.trim().length ? Math.max(0, Math.trunc(Number(workerFemale))) : null;

  const baseRequest: any = {
    employer_name: employerName.trim(),
    employer_tax_id: employerTaxId.trim() || null,
    employer_tel: employerTel.trim() || null,
    employer_type: employerType.trim() || null,
    employer_address: employerAddress.trim() || null,
    worker_count: wc,
    worker_male: male,
    worker_female: female,
    worker_nation: isMouSelected ? workerNation.trim() || null : null,
    worker_type: isMouSelected ? workerType.trim() || null : null,
    poa_request_type_id: type.id,
    status: isOperationContext ? "paid" : "submitted",
    representative_profile_id: rep.profile_id,
    representative_rep_code: rep.rep_code,
    representative_name: repDisplayName(rep) ?? null,
  };

  const { data: created, error: insErr } = await supabase
    .from("poa_requests")
    .insert(baseRequest)
    .select("id,display_id,import_temp_id,created_at")
    .single();
  if (insErr) throw new Error(insErr.message);

  const requestId = String((created as any)?.id);

  const baseUnit = Number(type.base_price ?? 0);
  const unit = isOperationContext ? 0 : (await resolvePoaUnitPricePerWorker({ supabase, repCode: rep.rep_code, poaRequestTypeId: type.id, fallbackUnitPrice: baseUnit })).unit;
  const itemRow = {
    poa_request_id: requestId,
    poa_request_type_id: type.id,
    unit_price_per_worker: unit,
    worker_count: wc,
    total_price: unit * wc,
    payment_status: isOperationContext ? "confirmed" : "unpaid",
  };
  const { error: itemErr } = await supabase.from("poa_request_items").upsert([itemRow], { onConflict: "poa_request_id,poa_request_type_id" });
  if (itemErr) throw new Error(itemErr.message);

  try {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (token) {
      await fetch("/api/notifications/line/poa-request-created", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId }),
      }).catch(() => null);
    }
  } catch {}

  if (!isOperationContext) {
    return { requestId, createdAt: (created as any)?.created_at ?? null };
  }

  const pdfReq: PoaRequestRow = {
    id: requestId,
    display_id: (created as any)?.display_id ?? null,
    import_temp_id: (created as any)?.import_temp_id ?? null,
    created_at: (created as any)?.created_at ?? null,
    poa_request_type_id: type.id,
    poa_request_type_name: type.name,
    representative_profile_id: rep.profile_id,
    representative_rep_code: rep.rep_code,
    representative_name: repDisplayName(rep) ?? null,
    representative_prefix: rep.prefix,
    representative_first_name: rep.first_name,
    representative_last_name: rep.last_name,
    representative_id_card_no: rep.id_card_no,
    representative_address: rep.address,
    employer_name: employerName.trim(),
    employer_tax_id: employerTaxId.trim() || null,
    employer_address: employerAddress.trim() || null,
    employer_tel: employerTel.trim() || null,
    employer_type: employerType.trim() || null,
    worker_count: wc,
    worker_male: male,
    worker_female: female,
    worker_nation: isMouSelected ? workerNation.trim() || null : null,
    worker_type: isMouSelected ? workerType.trim() || null : null,
    status: "paid",
    payment_amount: 0,
    payment_date: null,
    payment_file_url: null,
    payment_status_text: null,
    profiles: null,
  };

  const bytes = await buildPoaPdfBytes(pdfReq, []);
  const filename = `${(pdfReq.display_id ?? pdfReq.import_temp_id ?? pdfReq.id) as string}.pdf`;

  const { error: stErr } = await supabase.from("poa_requests").update({ status: "completed" }).eq("id", requestId);
  if (stErr) throw new Error(stErr.message);

  return { requestId, createdAt: (created as any)?.created_at ?? null, pdf: { bytes, filename } };
}
