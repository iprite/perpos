// treasury/page.tsx — เงินสด & ธนาคารทั้งกลุ่ม (hybrid) · viewer เข้าไม่ได้
import { listBankAccounts, listBankBalances, listCompanies } from "@/lib/p2p-group/queries";
import { requireP2pGroupMoneyPage } from "../_components/guard";
import { TreasuryClient } from "./_treasury-client";

export default async function TreasuryPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireP2pGroupMoneyPage(orgSlug);

  const [companies, accounts, balances] = await Promise.all([
    listCompanies(ctx.rls, ctx.orgId),
    listBankAccounts(ctx.rls, ctx.orgId),
    listBankBalances(ctx.rls, ctx.orgId),
  ]);

  return (
    <TreasuryClient
      companies={companies}
      accounts={accounts}
      balances={balances}
      orgId={ctx.orgId}
      canWrite={ctx.canWrite}
    />
  );
}
