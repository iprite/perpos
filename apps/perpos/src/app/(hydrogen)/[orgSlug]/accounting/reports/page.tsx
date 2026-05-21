import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { FinancialReportsClient } from "@/components/reports/financial-reports-client";
import type { PnlRow, TrialBalanceRow } from "@/lib/reports/actions";

export const dynamic = "force-dynamic";

function startOfMonthISO(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1);
  return dt.toISOString().slice(0, 10);
}

export default async function FinancialReportsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  const today = new Date();
  const startDate = startOfMonthISO(today);
  const endDate = today.toISOString().slice(0, 10);

  let trial: TrialBalanceRow[] = [];
  let pnl: PnlRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const [{ data: tb, error: te }, { data: pl, error: pe }] = await Promise.all([
      supabase.rpc("rpc_trial_balance", {
        p_organization_id: activeOrganizationId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_posted_only: true,
        p_include_closing: true,
      }),
      supabase.rpc("rpc_pnl", {
        p_organization_id: activeOrganizationId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_posted_only: true,
        p_include_closing: false,
      }),
    ]);

    if (te) error = te.message;
    if (pe) error = error ? `${error}; ${pe.message}` : pe.message;

    trial = (tb ?? []).map((r: any) => ({
      accountId: String(r.account_id),
      accountCode: String(r.account_code),
      accountName: String(r.account_name),
      accountType: String(r.account_type),
      parentAccountId: r.parent_account_id ? String(r.parent_account_id) : null,
      level: Number(r.level ?? 0),
      openingDebit: Number(r.opening_debit ?? 0),
      openingCredit: Number(r.opening_credit ?? 0),
      periodDebit: Number(r.period_debit ?? 0),
      periodCredit: Number(r.period_credit ?? 0),
      closingDebit: Number(r.closing_debit ?? 0),
      closingCredit: Number(r.closing_credit ?? 0),
    }));

    pnl = (pl ?? []).map((r: any) => ({
      section: String(r.section),
      accountId: String(r.account_id),
      accountCode: String(r.account_code),
      accountName: String(r.account_name),
      parentAccountId: r.parent_account_id ? String(r.parent_account_id) : null,
      level: Number(r.level ?? 0),
      amount: Number(r.amount ?? 0),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">รายงานการเงิน</div>
          <div className="mt-1 text-sm text-slate-600">Trial Balance และกำไรขาดทุน (P&L)</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <FinancialReportsClient
            organizationId={activeOrganizationId}
            initialStartDate={startDate}
            initialEndDate={endDate}
            initialTrialBalance={trial}
            initialPnl={pnl}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

