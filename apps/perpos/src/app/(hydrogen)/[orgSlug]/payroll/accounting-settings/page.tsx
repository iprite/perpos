import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { getAccountSettingsAction } from "@/lib/payroll/actions";
import { PayrollAccountSettingsClient } from "@/components/payroll/payroll-account-settings-client";

export const dynamic = "force-dynamic";

export default async function PayrollAccountingSettingsPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialSettings: Record<string, string> = {};

  if (activeOrganizationId) {
    const res = await getAccountSettingsAction({ organizationId: activeOrganizationId });
    if (res.ok) initialSettings = res.settings;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">ตั้งค่าการบันทึกบัญชี</div>
        <div className="mt-1 text-sm text-slate-600">กำหนดบัญชีที่ใช้บันทึกรายการเงินเดือน</div>
      </div>

      {activeOrganizationId ? (
        <PayrollAccountSettingsClient
          organizationId={activeOrganizationId}
          initialSettings={initialSettings}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </div>
  );
}
