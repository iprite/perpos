import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { fetchFinancePageData } from "@/lib/finance/queries";
import { GeneralLedgerClient } from "@/components/finance/general-ledger-client";
import { PageShell } from "@/components/ui/page-shell";

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
    <PageShell
      width="default"
      title="บัญชีแยกประเภท"
      description={<>General Ledger — รายการเคลื่อนไหวแต่ละบัญชี</>}
    >
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
    </PageShell>
  );
}
