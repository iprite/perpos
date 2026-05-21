import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listPayrollRunsAction, type RunRow } from "@/lib/payroll/actions";
import { PayrollSalaryClient } from "@/components/payroll/payroll-salary-client";

export const dynamic = "force-dynamic";

export default async function PayrollSalaryPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: RunRow[] = [];

  if (activeOrganizationId) {
    const res = await listPayrollRunsAction({ organizationId: activeOrganizationId });
    if (res.ok) initialRows = res.rows;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">เงินเดือน</div>
        <div className="mt-1 text-sm text-slate-600">รอบการจ่ายเงินเดือนประจำเดือน</div>
      </div>

      {activeOrganizationId ? (
        <PayrollSalaryClient
          organizationId={activeOrganizationId}
          initialRows={initialRows}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </div>
  );
}
