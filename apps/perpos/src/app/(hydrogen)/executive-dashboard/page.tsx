import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId, getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { ExecutiveDashboardClient } from "@/components/reports/executive-dashboard-client";
import type { AgingRow, ExecKpis, ExecTrendRow, TopExpenseRow } from "@/lib/reports/actions";

export const dynamic = "force-dynamic";

export default async function ExecutiveDashboardPage() {
  const organizations = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  const endMonth = new Date().toISOString().slice(0, 10);

  let kpis: ExecKpis = { revenue: 0, expense: 0, netProfit: 0 };
  let trends: ExecTrendRow[] = [];
  let topExpenses: TopExpenseRow[] = [];
  let receivableAging: AgingRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const [{ data: k, error: ke }, { data: t, error: te }, { data: top, error: tope }, { data: aging, error: ae }] =
      await Promise.all([
        supabase.rpc("rpc_exec_dashboard_kpis", { p_organization_id: activeOrganizationId, p_month: endMonth }),
        supabase.rpc("rpc_exec_dashboard_trends", { p_organization_id: activeOrganizationId, p_end_month: endMonth }),
        supabase.rpc("rpc_top_expenses", {
          p_organization_id: activeOrganizationId,
          p_start_date: endMonth.slice(0, 7) + "-01",
          p_end_date: endMonth,
          p_limit: 5,
        }),
        supabase.rpc("rpc_receivable_aging", { p_organization_id: activeOrganizationId, p_as_of: endMonth }),
      ]);

    if (ke) error = ke.message;
    if (te) error = error ? `${error}; ${te.message}` : te.message;
    if (tope) error = error ? `${error}; ${tope.message}` : tope.message;
    if (ae) error = error ? `${error}; ${ae.message}` : ae.message;

    const kr = (k as any)?.[0] ?? null;
    kpis = {
      revenue: Number(kr?.revenue ?? 0),
      expense: Number(kr?.expense ?? 0),
      netProfit: Number(kr?.net_profit ?? 0),
    };
    trends = (t ?? []).map((r: any) => ({
      month: String(r.month),
      revenue: Number(r.revenue ?? 0),
      expense: Number(r.expense ?? 0),
      netProfit: Number(r.net_profit ?? 0),
    }));
    topExpenses = (top ?? []).map((r: any) => ({ label: String(r.label), amount: Number(r.amount ?? 0) }));
    receivableAging = (aging ?? []).map((r: any) => ({
      bucket: String(r.bucket),
      count: Number(r.count ?? 0),
      amount: Number(r.amount ?? 0),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">แดชบอร์ดผู้บริหาร</div>
          <div className="mt-1 text-sm text-slate-600">สรุปภาพรวมรายได้ ค่าใช้จ่าย และลูกหนี้คงค้าง</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <ExecutiveDashboardClient
            organizationId={activeOrganizationId}
            initialEndMonth={endMonth}
            initialKpis={kpis}
            initialTrends={trends}
            initialTopExpenses={topExpenses}
            initialReceivableAging={receivableAging}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

