import React from "react";

import { getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { PurchaseDocCreateForm } from "@/components/purchase/documents/purchase-doc-create-form";
import { PURCHASE_DOC_TYPE_CONFIGS } from "@/components/purchase/documents/purchase-doc-type-config";
import { fetchNewPurchaseDocPageData } from "@/lib/purchase/documents/queries";

export const dynamic = "force-dynamic";

const config = PURCHASE_DOC_TYPE_CONFIGS.deposit_payment;

export default async function NewDepositPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const { activeOrganizationId, vendors, inventoryOptions, refDocOptions } = await fetchNewPurchaseDocPageData();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">สร้าง{config.nameTh}</div>
          <div className="mt-1 text-sm text-slate-600">คำนวณ VAT แบบเรียลไทม์</div>
        </div>
      </div>
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
    </div>
  );
}
