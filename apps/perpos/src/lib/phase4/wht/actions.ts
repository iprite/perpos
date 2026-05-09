"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadOrgFile } from "@/lib/phase4/storage";

export type WhtCreateInput = {
  organizationId: string;
  whtDate: string;
  payerName: string;
  payerTaxId?: string;
  payerAddress?: string;
  receiverName: string;
  receiverTaxId?: string;
  receiverAddress?: string;
  whtCategory: string;
  whtRate: number;
  baseAmount: number;
  notes?: string;
};

export async function createWhtCertificateAction(input: WhtCreateInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_create_wht_certificate", {
    p_organization_id: input.organizationId,
    p_wht_date: input.whtDate,
    p_payer_name: input.payerName,
    p_payer_tax_id: input.payerTaxId ?? "",
    p_payer_address: input.payerAddress ?? "",
    p_receiver_name: input.receiverName,
    p_receiver_tax_id: input.receiverTaxId ?? "",
    p_receiver_address: input.receiverAddress ?? "",
    p_wht_category: input.whtCategory,
    p_wht_rate: input.whtRate,
    p_base_amount: input.baseAmount,
    p_notes: input.notes ?? "",
  });
  if (error) return { ok: false as const, error: error.message ?? "create_failed" };
  const whtId = String(data);
  const { data: wht } = await supabase
    .from("wht_certificates")
    .select("id,certificate_no")
    .eq("id", whtId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  return { ok: true as const, whtId, certificateNo: wht?.certificate_no ? String((wht as any).certificate_no) : null };
}

export async function postWhtLiabilityAutoAction(params: { organizationId: string; whtId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: payable, error: pErr } = await supabase
    .from("accounts")
    .select("id,code,name")
    .eq("organization_id", params.organizationId)
    .eq("is_active", true)
    .or("name.ilike.%หัก ณ ที่จ่าย%,name.ilike.%wht%")
    .limit(1)
    .maybeSingle();
  if (pErr || !payable) return { ok: false as const, error: "missing_wht_payable_account" };

  const { data: debit, error: dErr } = await supabase
    .from("accounts")
    .select("id,code,name")
    .eq("organization_id", params.organizationId)
    .eq("is_active", true)
    .or("name.ilike.%เจ้าหนี้%,name.ilike.%payable%")
    .limit(1)
    .maybeSingle();
  if (dErr || !debit) return { ok: false as const, error: "missing_debit_account" };

  const { data, error } = await supabase.rpc("rpc_post_wht_liability", {
    p_wht_id: params.whtId,
    p_debit_account_id: debit.id,
    p_wht_payable_account_id: payable.id,
  });
  if (error) return { ok: false as const, error: error.message ?? "post_failed" };
  return { ok: true as const, journalEntryId: String(data) };
}

export async function uploadWhtPdfAction(params: { organizationId: string; whtId: string; file: File }) {
  const supabase = await createSupabaseServerClient();
  const { data: wht, error: wErr } = await supabase
    .from("wht_certificates")
    .select("id,certificate_no,document_id")
    .eq("id", params.whtId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (wErr || !wht) return { ok: false as const, error: "not_found" };

  const certNo = (wht as any).certificate_no ? String((wht as any).certificate_no) : "WHT";
  const objectPath = `${params.organizationId}/wht/${certNo}.pdf`;
  const up = await uploadOrgFile({
    organizationId: params.organizationId,
    bucket: "documents",
    objectPath,
    file: params.file,
    contentType: "application/pdf",
  });
  if (!up.ok) return up;

  const docId = (wht as any).document_id ? String((wht as any).document_id) : null;
  if (docId) {
    await supabase.from("documents").update({ storage_path: objectPath }).eq("id", docId).eq("organization_id", params.organizationId);
  }
  return { ok: true as const, path: objectPath };
}
