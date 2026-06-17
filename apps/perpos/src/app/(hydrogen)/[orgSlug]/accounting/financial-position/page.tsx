import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { getBalanceSheetAction, type BalanceSheetRow } from "@/lib/finance/report-actions";
import { BalanceSheetClient } from "@/components/finance/balance-sheet-client";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function FinancialPositionPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  const today = new Date().toISOString().slice(0, 10);
  let initialRows: BalanceSheetRow[] = [];

  if (activeOrganizationId) {
    const { rows } = await getBalanceSheetAction(activeOrganizationId, today);
    initialRows = rows;
  }

  return (
    <PageShell
      width="narrow"
      title="งบฐานะการเงิน"
      description={<>Statement of Financial Position — สินทรัพย์ หนี้สิน และส่วนของผู้ถือหุ้น</>}
    >
      {activeOrganizationId ? (
        <BalanceSheetClient
          organizationId={activeOrganizationId}
          initialDate={today}
          initialRows={initialRows}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">กรุณาเลือกองค์กร</div>
      )}
    </PageShell>
  );
}
