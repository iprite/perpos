import { notFound } from "next/navigation";

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { getDoc } from "@/lib/admin/product-docs";
import { DocWorkspace } from "./_workspace";

type Props = { params: Promise<{ id: string }> };

// Server Component — gate SSR + ดึงเอกสาร initial → ส่งให้ client workspace (hybrid)
export default async function ProductDocDetailPage({ params }: Props) {
  const admin = await requireSuperAdminPage();
  const { id } = await params;
  const doc = await getDoc(admin, id);
  if (!doc) notFound();

  return <DocWorkspace initialDoc={doc} />;
}
