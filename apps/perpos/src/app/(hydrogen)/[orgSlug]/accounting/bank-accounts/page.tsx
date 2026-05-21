import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { fetchFinanceAccounts, fetchFinancePageData } from "@/lib/finance/queries";
import { FinanceAccountsTable } from "@/components/finance/finance-accounts-table";
import { FinanceAccountForm } from "@/components/finance/finance-account-form";

export const dynamic = "force-dynamic";

export default async function BankAccountsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchFinanceAccounts("bank");
  const { chartAccounts }    = await fetchFinancePageData();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">บัญชีธนาคาร</div>
          <div className="mt-1 text-sm text-slate-600">จัดการบัญชีธนาคารขององค์กร</div>
        </div>
      </div>
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {activeOrganizationId && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-700">เพิ่มบัญชีธนาคาร</div>
          <FinanceAccountForm
            organizationId={activeOrganizationId}
            accountCategory="bank"
            chartAccounts={chartAccounts}
          />
        </div>
      )}
      <div className="mt-6">
        <FinanceAccountsTable rows={rows} organizationId={activeOrganizationId ?? ""} />
      </div>
    </div>
  );
}
