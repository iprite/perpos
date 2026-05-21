import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { FinancialReportsClient } from "@/components/reports/financial-reports-client";
import type { PnlRow } from "@/lib/reports/actions";

export const dynamic = "force-dynamic";

function startOfMonthISO(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function IncomeStatementPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  const today     = new Date();
  const startDate = startOfMonthISO(today);
  const endDate   = today.toISOString().slice(0, 10);

  let pnl: PnlRow[] = [];

  if (activeOrganizationId) {
    const { data } = await supabase.rpc("rpc_pnl", {
      p_organization_id: activeOrganizationId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_posted_only: true,
      p_include_closing: false,
    });
    pnl = (data ?? []).map((r: any) => ({
      section:         String(r.section),
      accountId:       String(r.account_id),
      accountCode:     String(r.account_code),
      accountName:     String(r.account_name),
      parentAccountId: r.parent_account_id ? String(r.parent_account_id) : null,
      level:           Number(r.level ?? 0),
      amount:          Number(r.amount ?? 0),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">งบกำไรขาดทุน</div>
        <div className="mt-1 text-sm text-slate-600">Income Statement (P&L)</div>
      </div>

      {activeOrganizationId ? (
        <FinancialReportsClient
          organizationId={activeOrganizationId}
          initialStartDate={startDate}
          initialEndDate={endDate}
          initialTrialBalance={[]}
          initialPnl={pnl}
          initialTab="pnl"
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">กรุณาเลือกองค์กร</div>
      )}
    </div>
  );
}
