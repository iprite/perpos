import React from "react";

import { PayrollReportsClient } from "@/components/payroll/payroll-reports-client";

export const dynamic = "force-dynamic";

export default async function PayrollReportsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">รายงาน Payroll</div>
        <div className="mt-1 text-sm text-slate-600">รายงานและเอกสารที่เกี่ยวข้องกับเงินเดือน</div>
      </div>
      <PayrollReportsClient />
    </div>
  );
}
