// page.tsx — แดชบอร์ด (ภาพรวม) — server component (guard + RLS fetch → client view)
// ตาม CONTEXT §5: per-org module = server + getModuleRoleForCurrentUser + createSupabaseServerClient

import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { requireGovProcurePage } from "./_components/guard";
import { DashboardClient } from "./_dashboard-client";

export default async function GovProcureDashboardPage({
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
    <DashboardClient
      orders={orders}
      settings={settings}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      role={ctx.role}
    />
  );
}
