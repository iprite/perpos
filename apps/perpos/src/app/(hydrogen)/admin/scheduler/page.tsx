import { Clock } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { computeSchedulerRuns } from "@/lib/admin/scheduler";
import { AdminPage } from "../_components/admin-page";
import { SchedulerView } from "./_view";

export default async function SchedulerMonitorPage() {
  const admin = await requireSuperAdminPage();
  const data = await computeSchedulerRuns(admin);

  return (
    <AdminPage
      width="wide"
      title="Scheduler Monitor"
      icon={<Clock className="h-6 w-6" />}
      description="สถานะ cron scheduler (รันทุก 1 นาที) — stuck jobs, requeue, PDPA cleanup"
    >
      <SchedulerView initialData={data} />
    </AdminPage>
  );
}
