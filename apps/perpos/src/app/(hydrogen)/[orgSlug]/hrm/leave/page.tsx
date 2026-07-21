// leave/page.tsx — การลา (server component, RLS)
// guard + listLeaveRequests + listLeaveTypes + computeBalances + พนักงานที่ทำงานอยู่ → props
// client view ทำ filter/dialog/mutation ผ่าน /api/hrm/leave (Bearer)

import { CalendarOff } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { listLeaveRequests, listLeaveTypes, computeBalances } from "@/lib/hrm/leave";
import { listEmployees } from "@/lib/hrm/employees";
import { requireHrmPage } from "../_components/guard";
import { LeaveClient } from "./_leave-client";

export default async function LeavePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireHrmPage(orgSlug);
  const year = new Date().getFullYear();

  const [requests, leaveTypes, balances, employees] = await Promise.all([
    listLeaveRequests(ctx.rls, ctx.orgId),
    listLeaveTypes(ctx.rls, ctx.orgId),
    computeBalances(ctx.rls, ctx.orgId, year),
    listEmployees(ctx.rls, ctx.orgId),
  ]);

  return (
    <PageShell
      width="full"
      icon={<CalendarOff className="h-6 w-6" />}
      title="การลา"
      description="ใบลาทั้งหมด อนุมัติ/ปฏิเสธ และดูวันลาคงเหลือของพนักงานแต่ละคน"
    >
      <LeaveClient
        initialRequests={requests}
        leaveTypes={leaveTypes}
        balances={balances}
        employees={employees}
        orgId={ctx.orgId}
        canWrite={ctx.canWrite}
        year={year}
      />
    </PageShell>
  );
}
