// settings/page.tsx — ตั้งค่า/แจ้งเตือน (server component, RLS) → client view
// GET ผ่าน lib getSettings (default ถ้ายังไม่มี row) · PUT owner/manager เท่านั้น (client)

import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { requireGovProcurePage } from "../_components/guard";
import { SettingsClient } from "./_settings-client";

export default async function GovProcureSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireGovProcurePage(orgSlug);
  const [orders, settings] = await Promise.all([
    listOrders(ctx.rls, ctx.orgId),
    getSettings(ctx.rls, ctx.orgId),
  ]);

  return (
    <SettingsClient
      orders={orders}
      settings={settings}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      role={ctx.role}
    />
  );
}
