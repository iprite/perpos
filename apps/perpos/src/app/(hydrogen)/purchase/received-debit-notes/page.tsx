import React from "react";

import { getOrganizationsForCurrentUser, getActiveOrganizationId } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { PurchaseDocsTable } from "@/components/purchase/documents/purchase-docs-table";
import { PURCHASE_DOC_TYPE_CONFIGS } from "@/components/purchase/documents/purchase-doc-type-config";
import { fetchPurchaseDocRows } from "@/lib/purchase/documents/queries";

export const dynamic = "force-dynamic";

const config = PURCHASE_DOC_TYPE_CONFIGS.received_debit_note;

export default async function ReceivedDebitNotesListPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchPurchaseDocRows("received_debit_note");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">{config.nameTh}</div>
          <div className="mt-1 text-sm text-slate-600">รายการ{config.nameTh}ขององค์กร</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="mt-6">
        <PurchaseDocsTable config={config} organizations={organizations} activeOrganizationId={activeOrganizationId} rows={rows} />
      </div>
    </div>
  );
}
