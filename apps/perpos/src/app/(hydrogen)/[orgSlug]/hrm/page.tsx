// page.tsx — ภาพรวม HR (server component, RLS)
// guard slug→org + member + ดึง KPI ผ่าน lib/hrm/dashboard → ส่ง props ให้ client view
// ตาม CONTEXT §5: per-org module = server + getModuleRoleForCurrentUser + createSupabaseServerClient

import { LayoutDashboard } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { getHrmDashboard } from "@/lib/hrm/dashboard";
import { requireHrmPage } from "./_components/guard";
import { HrmDashboardView } from "./_components/dashboard-view";

export default async function HrmDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireHrmPage(orgSlug);
  const data = await getHrmDashboard(ctx.rls, ctx.orgId);

  return (
    <PageShell
      width="full"
      icon={<LayoutDashboard className="h-6 w-6" />}
      title="ภาพรวม"
      description="สุขภาพ HR ในจอเดียว — พนักงาน ต้นทุนเงินเดือน ใบลา และวันสำคัญ"
    >
      <HrmDashboardView data={data} orgSlug={orgSlug} />
    </PageShell>
  );
}
