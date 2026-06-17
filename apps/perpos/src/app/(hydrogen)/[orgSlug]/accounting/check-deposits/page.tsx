import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { fetchCheckTransactions, fetchFinancePageData } from "@/lib/finance/queries";
import { CheckTransactionsTable } from "@/components/finance/check-transactions-table";
import { CheckTransactionForm } from "@/components/finance/check-transaction-form";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function CheckDepositsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchCheckTransactions("deposit");
  const { contacts, financeAccounts } = await fetchFinancePageData();

  return (
    <PageShell
      width="default"
      title="เช็ครับ"
      description={<>รายการเช็ครับขององค์กร</>}
    >
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {activeOrganizationId && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-700">บันทึกเช็ครับ</div>
          <CheckTransactionForm
            organizationId={activeOrganizationId}
            txnType="deposit"
            contacts={contacts}
            financeAccounts={financeAccounts}
          />
        </div>
      )}
      <div className="mt-6">
        <CheckTransactionsTable rows={rows} organizationId={activeOrganizationId ?? ""} />
      </div>
    </PageShell>
  );
}
