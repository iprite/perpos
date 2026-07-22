// catalogs/products/page.tsx — คลังสินค้า (server component, RLS)
// guard per-org → listProducts ด้วย `ctx.rls` → client view (แก้/ลบผ่าน dialog)
// route static `products` ชนะ dynamic `[id]` เสมอใน Next.js → ไม่ชนกัน

import { listProducts } from "@/lib/gov-procure/catalog-product-list";
import { requireGovProcurePage } from "../../_components/guard";
import { ProductsClient } from "./_products-client";

export default async function CatalogProductsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireGovProcurePage(orgSlug);
  const page = await listProducts(ctx.rls, ctx.orgId);

  return (
    <ProductsClient
      initialProducts={page.rows}
      total={page.total}
      truncated={page.truncated}
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canWrite={ctx.canWrite}
      // ลบออกจากคลัง = owner/manager เท่านั้น (กฎเดียวกับ `canDelete` ใน api/gov-procure/_lib.ts)
      canDelete={ctx.role === "owner" || ctx.role === "manager"}
    />
  );
}
