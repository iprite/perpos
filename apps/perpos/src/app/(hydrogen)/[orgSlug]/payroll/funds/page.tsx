import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listFundsAction, type FundRow } from "@/lib/payroll/actions";
import { FundsClient } from "@/components/payroll/funds-client";

export const dynamic = "force-dynamic";

export default async function PayrollFundsPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: FundRow[] = [];

  if (activeOrganizationId) {
    const res = await listFundsAction({ organizationId: activeOrganizationId });
    if (res.ok) initialRows = res.rows;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">ข้อมูลกองทุน</div>
        <div className="mt-1 text-sm text-slate-600">จัดการข้อมูลกองทุนและอัตราสมทบ</div>
      </div>

      {activeOrganizationId ? (
        <FundsClient
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
