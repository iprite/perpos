// companies/page.tsx — ทะเบียนบริษัทในเครือ (hybrid: SSR initial → client CRUD)
import { listCompanies } from "@/lib/p2p-group/queries";
import { requireP2pGroupPage } from "../_components/guard";
import { CompaniesClient } from "./_companies-client";

export default async function CompaniesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireP2pGroupPage(orgSlug);
  const companies = await listCompanies(ctx.rls, ctx.orgId);

  return (
    <CompaniesClient
      initial={companies}
      orgId={ctx.orgId}
      canWrite={ctx.canWrite}
      canSeeMoney={ctx.canSeeMoney}
    />
  );
}
