import React from "react";

import { getOrganizationsForCurrentUser, getActiveOrganizationId } from "@/lib/accounting/queries";
import { SaleDocsTable } from "@/components/sales/documents/sale-docs-table";
import { DOC_TYPE_CONFIGS } from "@/components/sales/documents/doc-type-config";
import { fetchSaleDocRows } from "@/lib/sales/documents/queries";

export const dynamic = "force-dynamic";

const config = DOC_TYPE_CONFIGS.billing_note;

export default async function BillingNotesListPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchSaleDocRows("billing_note");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">{config.nameTh}</div>
          <div className="mt-1 text-sm text-slate-600">รายการ{config.nameTh}ขององค์กร</div>
        </div>
      </div>
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="mt-6">
        <SaleDocsTable config={config} organizations={organizations} activeOrganizationId={activeOrganizationId} rows={rows} />
      </div>
    </div>
  );
}
