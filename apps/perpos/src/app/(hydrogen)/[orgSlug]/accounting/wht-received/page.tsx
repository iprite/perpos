import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { getWhtReceivedAction, type WhtReceivedRow } from "@/lib/finance/report-actions";
import { WhtReceivedClient } from "@/components/finance/wht-received-client";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

function startOfYearISO(d: Date) {
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

export default async function WhtReceivedPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  const today     = new Date();
  const startDate = startOfYearISO(today);
  const endDate   = today.toISOString().slice(0, 10);

  let initialRows: WhtReceivedRow[] = [];

  if (activeOrganizationId) {
    const res = await getWhtReceivedAction(activeOrganizationId, startDate, endDate);
    if (!res.error) initialRows = res.rows;
  }

  return (
    <PageShell
      width="default"
      title="ภาษีถูกหัก ณ ที่จ่าย"
      description={<>รายการเอกสารขายที่มีการหักภาษี ณ ที่จ่ายจากลูกค้า</>}
    >
      {activeOrganizationId ? (
        <WhtReceivedClient
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
