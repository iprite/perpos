// settings/page.tsx — ตั้งค่า HRM (server component, RLS)
// guard + payItems + funds + accountSettings + leaveTypes → props
// client view: 5 แท็บ (4 แท็บแรก mutation จริงผ่าน /api/hrm/settings?kind= · แท็บ LINE = placeholder)

import { Settings } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { listPayItems, listFunds, listAccountSettings } from "@/lib/hrm/settings";
import { listLeaveTypes } from "@/lib/hrm/leave";
import { requireHrmPage } from "../_components/guard";
import { SettingsClient } from "./_settings-client";

export default async function HrmSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireHrmPage(orgSlug);

  const [payItems, funds, accountSettings, leaveTypes] = await Promise.all([
    listPayItems(ctx.rls, ctx.orgId),
    listFunds(ctx.rls, ctx.orgId),
    listAccountSettings(ctx.rls, ctx.orgId),
    listLeaveTypes(ctx.rls, ctx.orgId),
  ]);

  return (
    <PageShell
      width="full"
      icon={<Settings className="h-6 w-6" />}
      title="ตั้งค่า"
      description="ตั้งค่าครั้งเดียวสำหรับงาน HR/เงินเดือน — ประเภทการลา เงินเพิ่ม/หัก กองทุน บัญชี และแจ้งเตือน LINE"
    >
      <SettingsClient
        payItems={payItems}
        funds={funds}
        accountSettings={accountSettings}
        leaveTypes={leaveTypes}
        orgId={ctx.orgId}
        canWrite={ctx.canWrite}
      />
    </PageShell>
  );
}
