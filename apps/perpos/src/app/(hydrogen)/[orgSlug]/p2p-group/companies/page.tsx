// companies/page.tsx — ทะเบียนบริษัทในเครือ (hybrid: SSR initial → client CRUD)
import { listCompanies } from "@/lib/p2p-group/queries";
import { stripSensitiveCompany } from "@/lib/p2p-group/types";
import { requireP2pGroupPage } from "../_components/guard";
import { CompaniesClient } from "./_companies-client";

export default async function CompaniesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireP2pGroupPage(orgSlug);
  const rows = await listCompanies(ctx.rls, ctx.orgId);
  // ตัดทุนจดทะเบียนออกที่ server — ซ่อนคอลัมน์อย่างเดียวไม่พอ ค่าจะติดไปกับ props
  const companies = ctx.canSeeMoney ? rows : rows.map(stripSensitiveCompany);

  return (
    <CompaniesClient
      initial={companies}
      orgId={ctx.orgId}
      canWrite={ctx.canWrite}
      canSeeMoney={ctx.canSeeMoney}
    />
  );
}
