// catalogs/letterheads/page.tsx — ค่าตั้งต้นหัวจดหมายต่อบริษัท (server component, RLS)
// guard per-org → listLetterheads ด้วย `ctx.rls` → client view (แก้ผ่าน Dialog → PUT)
// สิทธิ์แก้ = owner/manager (กฎเดียวกับ `canManageSettings` ใน api/gov-procure/_lib.ts)

import { listLetterheads } from "@/lib/gov-procure/catalog-letterhead-list";
import { requireGovProcurePage } from "../../_components/guard";
import { LetterheadsClient } from "./_letterheads-client";

export default async function CatalogLetterheadsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireGovProcurePage(orgSlug);
  const letterheads = await listLetterheads(ctx.rls, ctx.orgId);

  return (
    <LetterheadsClient
      initialLetterheads={letterheads}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canManage={ctx.role === "owner" || ctx.role === "manager"}
    />
  );
}
