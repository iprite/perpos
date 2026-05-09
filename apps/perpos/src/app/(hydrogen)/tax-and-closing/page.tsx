import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId, getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { TaxAndClosingClient } from "@/components/reports/tax-and-closing-client";
import type { OutputVatRow } from "@/lib/reports/actions";

export const dynamic = "force-dynamic";

function startOfMonthISO(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1);
  return dt.toISOString().slice(0, 10);
}

export default async function TaxAndClosingPage() {
  const organizations = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  const today = new Date();
  const startDate = startOfMonthISO(today);
  const endDate = today.toISOString().slice(0, 10);

  let rows: OutputVatRow[] = [];
  let wht = { count: 0, totalWithholding: 0 };
  let error: string | null = null;

  if (activeOrganizationId) {
    const [{ data: vat, error: ve }, { data: w, error: we }] = await Promise.all([
      supabase
        .from("vw_tax_output_vat")
        .select("issue_date,invoice_number,customer_name,customer_tax_id,amount,vat_amount")
        .eq("organization_id", activeOrganizationId)
        .gte("issue_date", startDate)
        .lte("issue_date", endDate)
        .order("issue_date", { ascending: false })
        .limit(500),
      supabase.rpc("rpc_wht_summary", { p_organization_id: activeOrganizationId, p_start_date: startDate, p_end_date: endDate }),
    ]);

    if (ve) error = ve.message;
    if (we) error = error ? `${error}; ${we.message}` : we.message;

    rows = (vat ?? []).map((r: any) => ({
      issueDate: String(r.issue_date),
      invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
      customerName: String(r.customer_name),
      customerTaxId: r.customer_tax_id ? String(r.customer_tax_id) : null,
      amount: Number(r.amount ?? 0),
      vatAmount: Number(r.vat_amount ?? 0),
    }));

    const wr = (w as any)?.[0] ?? null;
    wht = { count: Number(wr?.count ?? 0), totalWithholding: Number(wr?.total_withholding ?? 0) };
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">รายงานภาษีไทย & ปิดงบ</div>
          <div className="mt-1 text-sm text-slate-600">ภาษีขาย (Output VAT) และสรุปหัก ณ ที่จ่าย</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <TaxAndClosingClient
            organizationId={activeOrganizationId}
            initialStartDate={startDate}
            initialEndDate={endDate}
            initialRows={rows}
            initialWht={wht}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

