// catalogs/[id]/page.tsx — ห้องทำงานแคตตาล็อก (server component, RLS)
// guard per-org (member + RLS) → getCatalog/listItems/getCatalogItemStats ด้วย `ctx.rls`
// → ส่ง initial ให้ client view (mutation/dialog) · ห้ามใช้ admin service-role ในหน้า
// AGENTS.md §Page Load Performance ข้อ 2 (hybrid) + ข้อ 3 (guard ตรงโมเดล)

import { notFound } from "next/navigation";
import { getCatalog, getCatalogItemStats, listItems } from "@/lib/gov-procure/catalog";
import { requireGovProcurePage } from "../../_components/guard";
import { CatalogWorkspaceClient } from "./_catalog-workspace-client";

export default async function CatalogWorkspacePage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const ctx = await requireGovProcurePage(orgSlug);

  const catalog = await getCatalog(ctx.rls, ctx.orgId, id);
  if (!catalog) notFound();

  const [items, stats] = await Promise.all([
    listItems(ctx.rls, ctx.orgId, id),
    getCatalogItemStats(ctx.rls, ctx.orgId, id),
  ]);

  return (
    <CatalogWorkspaceClient
      catalog={catalog}
      initialItems={items.rows}
      total={items.total}
      truncated={items.truncated}
      serverStats={stats}
      orgId={ctx.orgId}
      canWrite={ctx.canWrite}
    />
  );
}
