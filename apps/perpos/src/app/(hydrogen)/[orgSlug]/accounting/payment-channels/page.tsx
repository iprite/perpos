import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { fetchFinanceAccounts, fetchFinancePageData } from "@/lib/finance/queries";
import { FinanceAccountsTable } from "@/components/finance/finance-accounts-table";
import { FinanceAccountForm } from "@/components/finance/finance-account-form";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function PaymentChannelsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchFinanceAccounts("payment_channel");
  const { chartAccounts }    = await fetchFinancePageData();

  return (
    <PageShell
      width="default"
      title="ช่องทางรับเงิน"
      description={<>จัดการช่องทางรับเงินขององค์กร</>}
    >
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {activeOrganizationId && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-700">เพิ่มช่องทางรับเงิน</div>
          <FinanceAccountForm
            organizationId={activeOrganizationId}
            accountCategory="payment_channel"
            chartAccounts={chartAccounts}
          />
        </div>
      )}
      <div className="mt-6">
        <FinanceAccountsTable rows={rows} organizationId={activeOrganizationId ?? ""} />
      </div>
    </PageShell>
  );
}
