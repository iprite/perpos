// catalogs/page.tsx — รายการชุดแคตตาล็อก (server component, RLS)
// guard per-org → listCatalogs + getCatalogListStats + listOrders ด้วย `ctx.rls`
// → client view (filter/dialog/mutation ยิง API จริง) · ท่าเดียวกับ orders/page.tsx

import { getCatalogListStats, listCatalogs } from "@/lib/gov-procure/catalog";
import { listOrders } from "@/lib/gov-procure/orders";
import { requireGovProcurePage } from "../_components/guard";
import { CatalogsClient } from "./_catalogs-client";

export default async function CatalogsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireGovProcurePage(orgSlug);

  const [page, stats, orders] = await Promise.all([
    listCatalogs(ctx.rls, ctx.orgId),
    getCatalogListStats(ctx.rls, ctx.orgId),
    listOrders(ctx.rls, ctx.orgId),
  ]);

  return (
    <CatalogsClient
      initialCatalogs={page.rows}
      total={page.total}
      truncated={page.truncated}
      stats={stats}
      orders={orders}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canWrite={ctx.canWrite}
    />
  );
}
