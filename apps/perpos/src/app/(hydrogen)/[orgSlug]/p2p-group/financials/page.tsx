// financials/page.tsx — ตัวเลขรายเดือนต่อบริษัท (hybrid: SSR initial → client CRUD)
// viewer เห็นได้เฉพาะรายได้/พนักงาน (strip ที่ server ผ่าน canSeeMoney)
import { listCompanies, listFinancials } from "@/lib/p2p-group/queries";
import { monthStart } from "@/lib/p2p-group/metrics";
import { stripSensitiveFinancial } from "@/lib/p2p-group/types";
import { requireP2pGroupPage } from "../_components/guard";
import { FinancialsClient } from "./_financials-client";

export default async function FinancialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgSlug } = await params;
  const { period } = await searchParams;
  const ctx = await requireP2pGroupPage(orgSlug);

  const periodMonth = /^\d{4}-\d{2}-01$/.test(period ?? "")
    ? (period as string)
    : monthStart(new Date());

  const [companies, financials] = await Promise.all([
    listCompanies(ctx.rls, ctx.orgId),
    listFinancials(ctx.rls, ctx.orgId, { periodMonth, basic: !ctx.canSeeMoney }),
  ]);

  return (
    <FinancialsClient
      companies={companies}
      financials={ctx.canSeeMoney ? financials : financials.map(stripSensitiveFinancial)}
      periodMonth={periodMonth}
      orgId={ctx.orgId}
      canWrite={ctx.canWrite}
      canSeeMoney={ctx.canSeeMoney}
    />
  );
}
