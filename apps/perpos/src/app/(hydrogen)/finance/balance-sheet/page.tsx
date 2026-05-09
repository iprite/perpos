import React from "react";

import { getOrganizationsForCurrentUser, getActiveOrganizationId } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { getBalanceSheetAction, type BalanceSheetRow } from "@/lib/finance/report-actions";
import { BalanceSheetClient } from "@/components/finance/balance-sheet-client";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();

  const today        = new Date().toISOString().slice(0, 10);
  let initialRows: BalanceSheetRow[] = [];

  if (activeOrganizationId) {
    const { rows } = await getBalanceSheetAction(activeOrganizationId, today);
    initialRows = rows;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">งบดุล</div>
          <div className="mt-1 text-sm text-slate-600">Balance Sheet — สินทรัพย์ หนี้สิน และส่วนของผู้ถือหุ้น</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>
      <div className="mt-6">
        {activeOrganizationId ? (
          <BalanceSheetClient
            organizationId={activeOrganizationId}
            initialDate={today}
            initialRows={initialRows}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">กรุณาเลือกองค์กร</div>
        )}
      </div>
    </div>
  );
}
