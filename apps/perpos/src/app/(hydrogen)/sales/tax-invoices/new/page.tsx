import React from "react";

import { getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { SaleDocCreateForm } from "@/components/sales/documents/sale-doc-create-form";
import { DOC_TYPE_CONFIGS } from "@/components/sales/documents/doc-type-config";
import { fetchNewDocPageData } from "@/lib/sales/documents/queries";

export const dynamic = "force-dynamic";

const config = DOC_TYPE_CONFIGS.tax_invoice;

export default async function NewTaxInvoicePage() {
  const organizations = await getOrganizationsForCurrentUser();
  const { activeOrganizationId, customers, inventoryOptions, invoiceOptions } = await fetchNewDocPageData();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">สร้าง{config.nameTh}</div>
          <div className="mt-1 text-sm text-slate-600">คำนวณ VAT แบบเรียลไทม์</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>
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
    </div>
  );
}
