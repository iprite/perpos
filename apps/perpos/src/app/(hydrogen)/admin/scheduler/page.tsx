import { Clock } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { computeSchedulerRuns } from "@/lib/admin/scheduler";
import { AdminPage } from "../_components/admin-page";
import { AdminTabs, SYSTEM_TABS } from "../_components/admin-tabs";
import { SchedulerView } from "./_view";

export default async function SchedulerMonitorPage() {
  const admin = await requireSuperAdminPage();
  const data = await computeSchedulerRuns(admin);

  return (
    <AdminPage
      width="wide"
      title="ระบบ & โครงสร้าง"
      icon={<Clock className="h-6 w-6" />}
      description="สถานะ cron scheduler (รันทุก 1 นาที) — stuck jobs, requeue, PDPA cleanup"
      tabs={<AdminTabs items={SYSTEM_TABS} />}
    >
      <SchedulerView initialData={data} />
    </AdminPage>
  );
}
