import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { fetchFinancePageData } from "@/lib/finance/queries";
import { GeneralLedgerClient } from "@/components/finance/general-ledger-client";

export const dynamic = "force-dynamic";

function startOfMonthISO(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function LedgerPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const { chartAccounts }    = await fetchFinancePageData();

  const today     = new Date();
  const startDate = startOfMonthISO(today);
  const endDate   = today.toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">บัญชีแยกประเภท</div>
          <div className="mt-1 text-sm text-slate-600">General Ledger — รายการเคลื่อนไหวแต่ละบัญชี</div>
        </div>
      </div>
      <div className="mt-6">
        {activeOrganizationId ? (
          <GeneralLedgerClient
            organizationId={activeOrganizationId}
            accounts={chartAccounts}
            initialAccountId={null}
            initialStartDate={startDate}
            initialEndDate={endDate}
            initialRows={[]}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">กรุณาเลือกองค์กร</div>
        )}
      </div>
    </div>
  );
}
