// intercompany/page.tsx — รายการระหว่างบริษัท + สัญญาเงินกู้ + กระทบยอด (hybrid)
// viewer เข้าไม่ได้ (ตัวเลขอ่อนไหวล้วน)
import { listCompanies, listIntercompany, listLoans } from "@/lib/p2p-group/queries";
import { requireP2pGroupMoneyPage } from "../_components/guard";
import { IntercompanyClient } from "./_intercompany-client";

export default async function IntercompanyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireP2pGroupMoneyPage(orgSlug);

  const [companies, transactions, loans] = await Promise.all([
    listCompanies(ctx.rls, ctx.orgId),
    listIntercompany(ctx.rls, ctx.orgId),
    listLoans(ctx.rls, ctx.orgId),
  ]);

  return (
    <IntercompanyClient
      companies={companies}
      transactions={transactions}
      loans={loans}
      orgId={ctx.orgId}
      canWrite={ctx.canWrite}
    />
  );
}
