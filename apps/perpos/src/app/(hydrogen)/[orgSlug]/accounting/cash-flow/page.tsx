import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { getCashFlowAction, type CashFlowRow } from "@/lib/finance/report-actions";
import { CashFlowClient } from "@/components/finance/cash-flow-client";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

function startOfYearISO(d: Date) {
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

export default async function CashFlowPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  const today     = new Date();
  const startDate = startOfYearISO(today);
  const endDate   = today.toISOString().slice(0, 10);

  let initialRows: CashFlowRow[] = [];

  if (activeOrganizationId) {
    const res = await getCashFlowAction(activeOrganizationId, startDate, endDate);
    if (!res.error) initialRows = res.rows;
  }

  return (
    <PageShell
      width="narrow"
      title="งบกระแสเงินสด"
      description={<>Cash Flow Statement (Indirect Method)</>}
    >
      {activeOrganizationId ? (
        <CashFlowClient
          organizationId={activeOrganizationId}
          initialStartDate={startDate}
          initialEndDate={endDate}
          initialRows={initialRows}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">กรุณาเลือกองค์กร</div>
      )}
    </PageShell>
  );
}
