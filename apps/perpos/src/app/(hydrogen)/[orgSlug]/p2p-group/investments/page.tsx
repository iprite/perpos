// investments/page.tsx — เงินลงทุน & เงินปันผล (hybrid) · viewer เข้าไม่ได้ (ตัวเลขอ่อนไหวล้วน)
import { listCompanies, listDividends, listInvestments } from "@/lib/p2p-group/queries";
import type { P2pgInvestment } from "@/lib/p2p-group/types";
import { requireP2pGroupMoneyPage } from "../_components/guard";
import { InvestmentsClient } from "./_investments-client";

export default async function InvestmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireP2pGroupMoneyPage(orgSlug);

  const [companies, investments, dividends] = await Promise.all([
    listCompanies(ctx.rls, ctx.orgId),
    listInvestments(ctx.rls, ctx.orgId),
    listDividends(ctx.rls, ctx.orgId),
  ]);

  return (
    <InvestmentsClient
      companies={companies}
      investments={investments as P2pgInvestment[]}
      dividends={dividends}
      orgId={ctx.orgId}
      canWrite={ctx.canWrite}
    />
  );
}
