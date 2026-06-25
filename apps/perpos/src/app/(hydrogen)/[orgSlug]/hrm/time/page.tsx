// time/page.tsx — เวลาทำงาน (server component, RLS)
// guard + พนักงานที่ทำงานอยู่ + attendance เดือนปัจจุบัน (ทั้ง org) → props
// client view: เลือกพนักงาน → ตาราง attendance + สรุป + แก้รายวันผ่าน /api/hrm/time (upsert, Bearer)

import { Clock } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { listEmployees } from "@/lib/hrm/employees";
import { listAttendance } from "@/lib/hrm/time";
import { requireHrmPage } from "../_components/guard";
import { TimeClient } from "./_time-client";

export default async function TimePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireHrmPage(orgSlug);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [employees, attendance] = await Promise.all([
    listEmployees(ctx.rls, ctx.orgId, { status: "active" }),
    listAttendance(ctx.rls, ctx.orgId, { year, month }),
  ]);

  return (
    <PageShell
      width="full"
      icon={<Clock className="h-6 w-6" />}
      title="เวลาทำงาน"
      description="บันทึกเข้า-ออกงานรายวัน — สรุปมา/สาย/ขาด/OT ป้อนเข้ารอบเงินเดือนอัตโนมัติ"
    >
      <TimeClient
        employees={employees}
        initialAttendance={attendance}
        orgId={ctx.orgId}
        canWrite={ctx.canWrite}
        year={year}
        month={month}
      />
    </PageShell>
  );
}
