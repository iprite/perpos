// catalogs/[id]/page.tsx — ห้องทำงานแคตตาล็อก (server component, RLS)
// guard per-org (member + RLS) → getCatalog/listItems/getCatalogItemStats/listOrders ด้วย `ctx.rls`
// → ส่ง initial ให้ client view (mutation/dialog) · ห้ามใช้ admin service-role ในหน้า
// AGENTS.md §Page Load Performance ข้อ 2 (hybrid) + ข้อ 3 (guard ตรงโมเดล)

import { notFound } from "next/navigation";
import { getCatalog, getCatalogItemStats, listItems } from "@/lib/gov-procure/catalog";
import { listOrders } from "@/lib/gov-procure/orders";
import {
  AVG_INPUT_TOKENS_PER_CALL,
  AVG_OUTPUT_TOKENS_PER_CALL,
  CHUNK_SIZE,
  estimateCost,
} from "@/lib/gov-procure/catalog-cost";
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

  const [items, stats, orders] = await Promise.all([
    listItems(ctx.rls, ctx.orgId, id),
    getCatalogItemStats(ctx.rls, ctx.orgId, id),
    listOrders(ctx.rls, ctx.orgId),
  ]);

  // เรตราคา AI อ่านจาก env ฝั่ง server เท่านั้น — client แค่คูณจำนวนคำขอ
  const costPerCallThb = estimateCost(AVG_INPUT_TOKENS_PER_CALL, AVG_OUTPUT_TOKENS_PER_CALL).thb;

  return (
    <CatalogWorkspaceClient
      catalog={catalog}
      initialItems={items.rows}
      total={items.total}
      truncated={items.truncated}
      serverStats={stats}
      orders={orders}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canWrite={ctx.canWrite}
      // ลบชุด = owner/manager เท่านั้น (กฎเดียวกับ `canDelete` ใน api/gov-procure/_lib.ts)
      canDelete={ctx.role === "owner" || ctx.role === "manager"}
      costPerCallThb={costPerCallThb}
      chunkSize={CHUNK_SIZE}
    />
  );
}
