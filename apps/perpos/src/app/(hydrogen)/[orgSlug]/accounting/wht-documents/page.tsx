import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { WhtDocumentsClient, type WhtRow } from "@/components/phase4/wht/wht-documents-client";

export const dynamic = "force-dynamic";

export default async function WhtDocumentsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let rows: WhtRow[] = [];
  let payerPrefill: { name?: string; taxId?: string; address?: string } | undefined;
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data: settings } = await supabase
      .from("org_settings")
      .select("company_name_th,tax_id,address")
      .eq("organization_id", activeOrganizationId)
      .maybeSingle();
    payerPrefill = {
      name: settings?.company_name_th ? String((settings as any).company_name_th) : undefined,
      taxId: settings?.tax_id ? String((settings as any).tax_id) : undefined,
      address: settings?.address ? String((settings as any).address) : undefined,
    };

    const { data, error: e } = await supabase
      .from("wht_certificates")
      .select("id,certificate_no,wht_date,receiver_name,base_amount,wht_amount,status,posted_journal_entry_id")
      .eq("organization_id", activeOrganizationId)
      .order("wht_date", { ascending: false })
      .limit(200);

    if (e) error = e.message;
    rows = (data ?? []).map((r: any) => ({
      id: String(r.id),
      certificateNo: r.certificate_no ? String(r.certificate_no) : null,
      whtDate: String(r.wht_date),
      receiverName: String(r.receiver_name),
      baseAmount: Number(r.base_amount ?? 0),
      whtAmount: Number(r.wht_amount ?? 0),
      status: String(r.status),
      postedJournalEntryId: r.posted_journal_entry_id ? String(r.posted_journal_entry_id) : null,
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">WHT + เอกสาร</div>
          <div className="mt-1 text-sm text-slate-600">ใบรับรองหัก ณ ที่จ่าย (50 ทวิ) และบันทึกบัญชีประกอบ</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <WhtDocumentsClient organizationId={activeOrganizationId} rows={rows} payerPrefill={payerPrefill} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

