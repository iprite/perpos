// orders/page.tsx — รายการงาน (server component, RLS)
// guard + listOrders/getSettings (RLS) → client view (filter/dialog/mutation ยิง API จริง)

import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { requireGovProcurePage } from "../_components/guard";
import { OrdersClient } from "./_orders-client";

export default async function OrdersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireGovProcurePage(orgSlug);
  const [orders, settings] = await Promise.all([
    listOrders(ctx.rls, ctx.orgId),
    getSettings(ctx.rls, ctx.orgId),
  ]);

  return (
    <OrdersClient
      orders={orders}
      settings={settings}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      role={ctx.role}
    />
  );
}
