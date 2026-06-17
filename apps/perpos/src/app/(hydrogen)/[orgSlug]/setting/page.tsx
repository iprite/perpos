import React from "react";
import { Settings } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { OrgSettingsClient } from "@/components/phase4/settings/org-settings-client";
import { PageShell } from "@/components/ui/page-shell";
import type { DocSequence, OrgSettings } from "@/lib/phase4/settings/actions";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let orgName = "";
  let baseCurrency = "THB";
  let settings: OrgSettings = {
    companyNameTh: "", companyNameEn: "", address: "", taxId: "", branchInfo: "",
    phone: "", email: "", website: "", fax: "",
    logoObjectPath: null, accountantSignatureObjectPath: null, authorizedSignatureObjectPath: null,
  };
  let sequences: DocSequence[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    // Fetch org base info
    const { data: org } = await supabase
      .from("organizations")
      .select("name,base_currency")
      .eq("id", activeOrganizationId)
      .maybeSingle();
    if (org) {
      orgName = String((org as any).name ?? "");
      baseCurrency = String((org as any).base_currency ?? "THB");
    }

    const { data: s, error: se } = await supabase
      .from("org_settings")
      .select(
        "company_name_th,company_name_en,address,tax_id,branch_info,phone,email,website,fax,logo_object_path,accountant_signature_object_path,authorized_signature_object_path",
      )
      .eq("organization_id", activeOrganizationId)
      .maybeSingle();
    if (se) error = se.message;
    if (s) {
      const r = s as any;
      settings = {
        companyNameTh: String(r.company_name_th ?? ""),
        companyNameEn: String(r.company_name_en ?? ""),
        address: String(r.address ?? ""),
        taxId: String(r.tax_id ?? ""),
        branchInfo: String(r.branch_info ?? ""),
        phone: String(r.phone ?? ""),
        email: String(r.email ?? ""),
        website: String(r.website ?? ""),
        fax: String(r.fax ?? ""),
        logoObjectPath: r.logo_object_path ? String(r.logo_object_path) : null,
        accountantSignatureObjectPath: r.accountant_signature_object_path ? String(r.accountant_signature_object_path) : null,
        authorizedSignatureObjectPath: r.authorized_signature_object_path ? String(r.authorized_signature_object_path) : null,
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
    <PageShell
      width="default"
      icon={<Settings className="h-6 w-6" />}
      title="ตั้งค่าองค์กร"
      description="โลโก้ ลายเซ็น และรูปแบบเลขที่เอกสาร"
    >
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <OrgSettingsClient
          organizationId={activeOrganizationId}
          initialOrgName={orgName}
          initialBaseCurrency={baseCurrency}
          initialSettings={settings}
          initialSequences={sequences}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </PageShell>
  );
}

