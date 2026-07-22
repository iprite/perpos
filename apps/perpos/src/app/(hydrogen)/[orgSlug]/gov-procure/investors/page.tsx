// investors/page.tsx — dashboard นักลงทุน (server component, RLS) → client view
// นักลงทุนทุกคนเห็นข้อมูลชุดเดียวกันทั้งหมด (เงินอยู่ที่ใครเท่าไร กำไรต่อคนเท่าไร)

import { listOrders } from "@/lib/gov-procure/orders";
import { listInvestors, listCapitalFlows, computeCapital } from "@/lib/gov-procure/capital";
import { requireGovProcurePage } from "../_components/guard";
import { InvestorsClient } from "./_investors-client";

export default async function GovProcureInvestorsPage({
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
    <InvestorsClient
      investors={investors}
      flows={flows}
      summary={computeCapital(orders, investors, flows)}
      orgId={ctx.orgId}
      canManage={ctx.canEditFinance}
    />
  );
}
