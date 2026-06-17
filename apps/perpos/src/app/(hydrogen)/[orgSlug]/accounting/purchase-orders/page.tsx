import React from "react";

import { getOrganizationsForCurrentUser, getActiveOrganizationId } from "@/lib/accounting/queries";
import { PurchaseDocsTable } from "@/components/purchase/documents/purchase-docs-table";
import { PURCHASE_DOC_TYPE_CONFIGS } from "@/components/purchase/documents/purchase-doc-type-config";
import { fetchPurchaseDocRows } from "@/lib/purchase/documents/queries";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

const config = PURCHASE_DOC_TYPE_CONFIGS.purchase_order;

export default async function PurchaseOrdersListPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchPurchaseDocRows("purchase_order");

  return (
    <PageShell
      width="default"
      title={<>{config.nameTh}</>}
      description={<>รายการ{config.nameTh}ขององค์กร</>}
    >
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="mt-6">
        <PurchaseDocsTable config={config} organizations={organizations} activeOrganizationId={activeOrganizationId} rows={rows} />
      </div>
    </PageShell>
  );
}
