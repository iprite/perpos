import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { fetchCheckTransactions, fetchFinancePageData } from "@/lib/finance/queries";
import { CheckTransactionsTable } from "@/components/finance/check-transactions-table";
import { CheckTransactionForm } from "@/components/finance/check-transaction-form";

export const dynamic = "force-dynamic";

export default async function CheckPaymentsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const { rows, error }      = await fetchCheckTransactions("payment");
  const { contacts, financeAccounts } = await fetchFinancePageData();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">เช็คจ่าย</div>
          <div className="mt-1 text-sm text-slate-600">รายการเช็คจ่ายขององค์กร</div>
        </div>
      </div>
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {activeOrganizationId && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-700">บันทึกเช็คจ่าย</div>
          <CheckTransactionForm
            organizationId={activeOrganizationId}
            txnType="payment"
            contacts={contacts}
            financeAccounts={financeAccounts}
          />
        </div>
      )}
      <div className="mt-6">
        <CheckTransactionsTable rows={rows} organizationId={activeOrganizationId ?? ""} />
      </div>
    </div>
  );
}
