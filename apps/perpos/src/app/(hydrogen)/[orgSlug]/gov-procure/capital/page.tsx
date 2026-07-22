// capital/page.tsx — กองทุน/เงินลงทุน (server component, RLS) → client view
// SSR ดึง orders + investors + flows → คำนวณยอดฝั่ง server (rule ล้วน) → client จัดการ mutation

import { listOrders } from "@/lib/gov-procure/orders";
import { listInvestors, listCapitalFlows, computeCapital } from "@/lib/gov-procure/capital";
import { requireGovProcurePage } from "../_components/guard";
import { CapitalClient } from "./_capital-client";

export default async function GovProcureCapitalPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireGovProcurePage(orgSlug);

  const [orders, investors, flows] = await Promise.all([
    listOrders(ctx.rls, ctx.orgId),
    listInvestors(ctx.rls, ctx.orgId),
    listCapitalFlows(ctx.rls, ctx.orgId),
  ]);

  return (
    <CapitalClient
      orders={orders}
      investors={investors}
      flows={flows}
      summary={computeCapital(orders, investors, flows)}
      orgId={ctx.orgId}
      canManage={ctx.canEditFinance}
    />
  );
}
