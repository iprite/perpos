// employees/[id]/page.tsx — แฟ้มพนักงาน 360° (server component, RLS)
// guard + getEmployee (ไม่พบ → notFound) + ดึงข้อมูลประกอบของคนนี้ (สลิป/ลา/เวลา/เอกสาร) → props
// ตาม CONTEXT §5: per-org module = member + RLS · ทุก query filter org_id

import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { getEmployee } from "@/lib/hrm/employees";
import { listRuns } from "@/lib/hrm/payroll";
import { listLeaveRequests, listLeaveTypes, computeBalances } from "@/lib/hrm/leave";
import { listAttendance } from "@/lib/hrm/time";
import { listDocuments } from "@/lib/hrm/documents";
import type { Payslip } from "@/lib/hrm/types";
import { requireHrmPage } from "../../_components/guard";
import { EmployeeDetail } from "./_employee-detail";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const ctx = await requireHrmPage(orgSlug);

  const employee = await getEmployee(ctx.rls, ctx.orgId, id);
  if (!employee) notFound();

  const now = new Date();
  const year = now.getFullYear();

  // ข้อมูลประกอบ — ผ่าน lib (filter org_id + employeeId)
  const [runs, leaveRequests, leaveTypes, balances, attendance, documents, slipRes] =
    await Promise.all([
      listRuns(ctx.rls, ctx.orgId),
      listLeaveRequests(ctx.rls, ctx.orgId, { employeeId: id }),
      listLeaveTypes(ctx.rls, ctx.orgId, { activeOnly: true }),
      computeBalances(ctx.rls, ctx.orgId, year),
      listAttendance(ctx.rls, ctx.orgId, { employeeId: id, year, month: now.getMonth() + 1 }),
      listDocuments(ctx.rls, ctx.orgId, { employeeId: id }),
      ctx.rls.from("hrm_payslips").select("*").eq("org_id", ctx.orgId).eq("employee_id", id),
    ]);
  if (slipRes.error) throw new Error(slipRes.error.message);
  const payslips = (slipRes.data ?? []) as Payslip[];

  const empBalances = balances.filter((b) => b.employee_id === id);

  return (
    <PageShell width="full" icon={<Users className="h-6 w-6" />} title="แฟ้มพนักงาน 360°">
      <EmployeeDetail
        employee={employee}
        runs={runs}
        payslips={payslips}
        leaveRequests={leaveRequests}
        leaveTypes={leaveTypes}
        balances={empBalances}
        attendance={attendance}
        attendanceMonth={{ year, month: now.getMonth() + 1 }}
        documents={documents}
        orgId={ctx.orgId}
        orgSlug={orgSlug}
        canWrite={ctx.canWrite}
      />
    </PageShell>
  );
}
