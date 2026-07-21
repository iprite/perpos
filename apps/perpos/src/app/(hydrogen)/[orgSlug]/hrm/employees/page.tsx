// employees/page.tsx — พนักงาน (server component, RLS)
// guard + listEmployees(rls, orgId) → props ให้ client view (filter/dialog/mutation)

import { Users } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { listEmployees } from "@/lib/hrm/employees";
import { requireHrmPage } from "../_components/guard";
import { EmployeesClient } from "./_employees-client";

export default async function EmployeesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireHrmPage(orgSlug);
  const employees = await listEmployees(ctx.rls, ctx.orgId);

  return (
    <PageShell
      width="full"
      icon={<Users className="h-6 w-6" />}
      title="พนักงาน"
      description="แฟ้มพนักงานทั้งหมด — ข้อมูลส่วนตัว ตำแหน่ง เงินเดือน และสถานะการจ้าง"
    >
      <EmployeesClient
        initial={employees}
        orgId={ctx.orgId}
        orgSlug={orgSlug}
        canWrite={ctx.canWrite}
      />
    </PageShell>
  );
}
