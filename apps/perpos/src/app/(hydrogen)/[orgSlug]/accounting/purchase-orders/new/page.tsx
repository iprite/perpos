import React from "react";

import { getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { PurchaseDocCreateForm } from "@/components/purchase/documents/purchase-doc-create-form";
import { PURCHASE_DOC_TYPE_CONFIGS } from "@/components/purchase/documents/purchase-doc-type-config";
import { fetchNewPurchaseDocPageData } from "@/lib/purchase/documents/queries";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

const config = PURCHASE_DOC_TYPE_CONFIGS.purchase_order;

export default async function NewPurchaseOrderPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const { activeOrganizationId, vendors, inventoryOptions, refDocOptions } = await fetchNewPurchaseDocPageData();

  return (
    <PageShell
      width="default"
      title={<>สร้าง{config.nameTh}</>}
      description={<>คำนวณ VAT แบบเรียลไทม์</>}
    >
      <div className="mt-6">
        <PurchaseDocCreateForm
          config={config}
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          vendors={vendors}
          inventoryOptions={inventoryOptions}
          refDocOptions={refDocOptions}
        />
      </div>
    </PageShell>
  );
}
