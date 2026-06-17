import React from "react";

import { getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { SaleDocCreateForm } from "@/components/sales/documents/sale-doc-create-form";
import { DOC_TYPE_CONFIGS } from "@/components/sales/documents/doc-type-config";
import { fetchNewDocPageData } from "@/lib/sales/documents/queries";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

const config = DOC_TYPE_CONFIGS.debit_note;

export default async function NewDebitNotePage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const { activeOrganizationId, customers, inventoryOptions, invoiceOptions } = await fetchNewDocPageData();

  return (
    <PageShell
      width="default"
      title={<>สร้าง{config.nameTh}</>}
      description={<>คำนวณ VAT แบบเรียลไทม์</>}
    >
      <div className="mt-6">
        <SaleDocCreateForm
          config={config}
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          customers={customers}
          inventoryOptions={inventoryOptions}
          invoiceOptions={invoiceOptions}
        />
      </div>
    </PageShell>
  );
}
