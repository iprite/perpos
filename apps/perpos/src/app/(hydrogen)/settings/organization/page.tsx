import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId, getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { OrgSettingsClient } from "@/components/phase4/settings/org-settings-client";
import type { DocSequence, OrgSettings } from "@/lib/phase4/settings/actions";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage() {
  const organizations = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let settings: OrgSettings = {
    companyNameTh: "",
    companyNameEn: "",
    address: "",
    taxId: "",
    branchInfo: "",
    logoObjectPath: null,
    accountantSignatureObjectPath: null,
    authorizedSignatureObjectPath: null,
  };
  let sequences: DocSequence[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data: s, error: se } = await supabase
      .from("org_settings")
      .select(
        "company_name_th,company_name_en,address,tax_id,branch_info,logo_object_path,accountant_signature_object_path,authorized_signature_object_path",
      )
      .eq("organization_id", activeOrganizationId)
      .maybeSingle();
    if (se) error = se.message;
    if (s) {
      settings = {
        companyNameTh: s.company_name_th ? String((s as any).company_name_th) : "",
        companyNameEn: s.company_name_en ? String((s as any).company_name_en) : "",
        address: s.address ? String((s as any).address) : "",
        taxId: s.tax_id ? String((s as any).tax_id) : "",
        branchInfo: s.branch_info ? String((s as any).branch_info) : "",
        logoObjectPath: s.logo_object_path ? String((s as any).logo_object_path) : null,
        accountantSignatureObjectPath: s.accountant_signature_object_path ? String((s as any).accountant_signature_object_path) : null,
        authorizedSignatureObjectPath: s.authorized_signature_object_path ? String((s as any).authorized_signature_object_path) : null,
      };
    }

    const { data: ds, error: de } = await supabase
      .from("document_sequences")
      .select("doc_type,prefix,next_number,reset_policy")
      .eq("organization_id", activeOrganizationId)
      .order("doc_type", { ascending: true });
    if (de) error = error ? `${error}; ${de.message}` : de.message;
    sequences = (ds ?? []).map((r: any) => ({
      docType: String(r.doc_type),
      prefix: String(r.prefix),
      nextNumber: Number(r.next_number ?? 1),
      resetPolicy: String(r.reset_policy) as any,
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">ตั้งค่าองค์กร</div>
          <div className="mt-1 text-sm text-slate-600">โลโก้ ลายเซ็น และรูปแบบเลขที่เอกสาร</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <OrgSettingsClient organizationId={activeOrganizationId} initialSettings={settings} initialSequences={sequences} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

