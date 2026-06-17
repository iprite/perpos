import React from "react";
import { Wallet } from "lucide-react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listPayrollRunsAction, type RunRow } from "@/lib/payroll/actions";
import { PayrollSalaryClient } from "@/components/payroll/payroll-salary-client";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function PayrollSalaryPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: RunRow[] = [];

  if (activeOrganizationId) {
    const res = await listPayrollRunsAction({ organizationId: activeOrganizationId });
    if (res.ok) initialRows = res.rows;
  }

  return (
    <PageShell
      width="default"
      icon={<Wallet className="h-6 w-6" />}
      title="เงินเดือน"
      description="รอบการจ่ายเงินเดือนประจำเดือน"
    >
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
    </PageShell>
  );
}
