"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadOrgFile } from "@/lib/phase4/storage";

export type OrgSettings = {
  companyNameTh: string;
  companyNameEn: string;
  address: string;
  taxId: string;
  branchInfo: string;
  phone: string;
  email: string;
  website: string;
  fax: string;
  logoObjectPath: string | null;
  accountantSignatureObjectPath: string | null;
  authorizedSignatureObjectPath: string | null;
};

export type DocSequence = {
  docType: string;
  prefix: string;
  nextNumber: number;
  resetPolicy: "never" | "yearly" | "monthly";
};

export async function upsertOrgSettingsAction(params: { organizationId: string; settings: OrgSettings }) {
  const supabase = await createSupabaseServerClient();
  const payload: any = {
    organization_id: params.organizationId,
    company_name_th: params.settings.companyNameTh,
    company_name_en: params.settings.companyNameEn,
    address: params.settings.address,
    tax_id: params.settings.taxId,
    branch_info: params.settings.branchInfo,
    phone: params.settings.phone || null,
    email: params.settings.email || null,
    website: params.settings.website || null,
    fax: params.settings.fax || null,
    logo_object_path: params.settings.logoObjectPath,
    accountant_signature_object_path: params.settings.accountantSignatureObjectPath,
    authorized_signature_object_path: params.settings.authorizedSignatureObjectPath,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("org_settings").upsert(payload, { onConflict: "organization_id" });
  if (error) return { ok: false as const, error: error.message ?? "save_failed" };
  return { ok: true as const };
}

export async function upsertDocumentSequencesAction(params: { organizationId: string; sequences: DocSequence[] }) {
  const supabase = await createSupabaseServerClient();
  const rows = params.sequences.map((s) => ({
    organization_id: params.organizationId,
    doc_type: s.docType,
    prefix: s.prefix,
    next_number: s.nextNumber,
    reset_policy: s.resetPolicy,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("document_sequences").upsert(rows, { onConflict: "organization_id,doc_type" });
  if (error) return { ok: false as const, error: error.message ?? "save_failed" };
  return { ok: true as const };
}

export async function updateOrgAction(params: {
  organizationId: string;
  name: string;
  baseCurrency: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('organizations')
    .update({ name: params.name, base_currency: params.baseCurrency, updated_at: new Date().toISOString() })
    .eq('id', params.organizationId);
  if (error) return { ok: false as const, error: error.message ?? 'save_failed' };
  return { ok: true as const };
}

export async function uploadOrgAssetAction(params: {
  organizationId: string;
  kind: "logo" | "accountant_signature" | "authorized_signature";
  file: File;
}) {
  const ext = guessExt(params.file);
  const objectPath = `${params.organizationId}/org-assets/${params.kind}${ext}`;
  const up = await uploadOrgFile({
    organizationId: params.organizationId,
    bucket: "org-assets",
    objectPath,
    file: params.file,
    contentType: params.file.type,
  });
  if (!up.ok) return up;
  return { ok: true as const, path: objectPath };
}

function guessExt(file: File) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".png")) return ".png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return ".jpg";
  if (n.endsWith(".svg")) return ".svg";
  return "";
}

