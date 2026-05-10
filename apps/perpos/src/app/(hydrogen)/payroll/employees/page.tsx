import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import {
  listEmployeesAction,
  listDepartmentsAction,
  type EmployeeRow,
  type DepartmentRow,
} from "@/lib/payroll/actions";
import { EmployeesClient } from "@/components/payroll/employees-client";

export const dynamic = "force-dynamic";

export default async function PayrollEmployeesPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: EmployeeRow[] = [];
  let departments: DepartmentRow[] = [];

  if (activeOrganizationId) {
    const [empRes, deptRes] = await Promise.all([
      listEmployeesAction({ organizationId: activeOrganizationId }),
      listDepartmentsAction({ organizationId: activeOrganizationId }),
    ]);
    if (empRes.ok)  initialRows  = empRes.rows;
    if (deptRes.ok) departments  = deptRes.rows;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">พนักงาน</div>
        <div className="mt-1 text-sm text-slate-600">ข้อมูลพนักงานขององค์กร</div>
      </div>

      {activeOrganizationId ? (
        <EmployeesClient
          organizationId={activeOrganizationId}
          initialRows={initialRows}
          departments={departments}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </div>
  );
}
