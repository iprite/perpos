// pipeline/page.tsx — บอร์ดไปป์ไลน์ (server component, RLS) → client kanban view

import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { requireGovProcurePage } from "../_components/guard";
import { PipelineClient } from "./_pipeline-client";

export default async function PipelinePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireGovProcurePage(orgSlug);
  const [orders, settings] = await Promise.all([
    listOrders(ctx.rls, ctx.orgId),
    getSettings(ctx.rls, ctx.orgId),
  ]);

  return (
    <PipelineClient
      orders={orders}
      settings={settings}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      role={ctx.role}
    />
  );
}
