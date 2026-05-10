import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listPayItemsAction, type PayItemRow } from "@/lib/payroll/actions";
import { PayItemsClient } from "@/components/payroll/pay-items-client";

export const dynamic = "force-dynamic";

export default async function PayrollPayItemsPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialEarnings: PayItemRow[] = [];
  let initialDeductions: PayItemRow[] = [];

  if (activeOrganizationId) {
    const res = await listPayItemsAction({ organizationId: activeOrganizationId });
    if (res.ok) {
      initialEarnings   = res.rows.filter((r) => r.item_type === "earning");
      initialDeductions = res.rows.filter((r) => r.item_type === "deduction");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">เงินเพิ่ม / เงินหัก</div>
        <div className="mt-1 text-sm text-slate-600">จัดการรายการเงินเพิ่มและเงินหักของพนักงาน</div>
      </div>

      {activeOrganizationId ? (
        <PayItemsClient
          organizationId={activeOrganizationId}
          initialEarnings={initialEarnings}
          initialDeductions={initialDeductions}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </div>
  );
}
