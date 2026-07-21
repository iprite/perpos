// reports/page.tsx — รายงาน (server component, RLS) → client view

import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { requireGovProcurePage } from "../_components/guard";
import { ReportsClient } from "./_reports-client";

export default async function GovProcureReportsPage({
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
    <ReportsClient
      orders={orders}
      settings={settings}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      role={ctx.role}
    />
  );
}
