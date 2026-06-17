import React from "react";

import { getOrganizationsForCurrentUser, getActiveOrganizationId } from "@/lib/accounting/queries";
import { SaleDocsTable } from "@/components/sales/documents/sale-docs-table";
import { DOC_TYPE_CONFIGS } from "@/components/sales/documents/doc-type-config";
import { fetchSaleDocRows } from "@/lib/sales/documents/queries";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

const config = DOC_TYPE_CONFIGS.deposit_receipt;

export default async function DepositsListPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchSaleDocRows("deposit_receipt");

  return (
    <PageShell
      width="default"
      title={<>{config.nameTh}</>}
      description={<>รายการ{config.nameTh}ขององค์กร</>}
    >
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="mt-6">
        <SaleDocsTable config={config} organizations={organizations} activeOrganizationId={activeOrganizationId} rows={rows} />
      </div>
    </PageShell>
  );
}
