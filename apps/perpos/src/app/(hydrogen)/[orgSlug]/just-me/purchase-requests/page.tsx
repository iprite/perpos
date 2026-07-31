/**
 * /[orgSlug]/just-me/purchase-requests — ทะเบียนใบขอซื้อ (PR)
 * ท่า: **server component + searchParams-driven** (โครงการ/สถานะ/คำค้น/หน้า อยู่ใน URL)
 * contract §5 ข้อ 4 · guard = member + RLS
 *
 * ⛔ viewer เข้าไม่ได้เลย — ทั้งหน้าเป็นข้อมูลต้นทุน (เมนูซ่อนอยู่แล้ว แต่พิมพ์ URL ตรงต้องไม่หลุด)
 */

import { Lock, ShoppingCart } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
import { listProjects } from "@/lib/just-me/projects";
import { listPurchaseRequests, listVendors } from "@/lib/just-me/purchasing";
import type { PurchaseRequestStatus } from "@/lib/just-me/types";
import { requireJustMePage } from "../_components/guard";
import { PurchaseRequestsClient, type PrListRow } from "./_pr-list-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function JustMePurchaseRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ projectId?: string; status?: string; q?: string; page?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireJustMePage(orgSlug);

  if (!ctx.canSeeCost) {
    return (
      <PageShell title="ใบขอซื้อ (PR)" icon={<ShoppingCart className="h-6 w-6" />}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="rounded-full bg-gray-100 p-4">
            <Lock className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">คุณไม่มีสิทธิ์เข้าหน้านี้</Text>
          <Text className="max-w-md text-sm text-gray-500">
            ใบขอซื้อมีราคาต้นทุนจากผู้ขาย จึงเปิดให้เฉพาะเจ้าของและผู้จัดการเท่านั้น
          </Text>
        </div>
      </PageShell>
    );
  }

  const projectId = (sp.projectId ?? "").trim();
  const status = (sp.status ?? "") as PurchaseRequestStatus | "";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const [prPage, projects, vendors, warehouses] = await Promise.all([
    listPurchaseRequests(ctx.rls, ctx.orgId, {
      projectId: projectId || undefined,
      status: status || undefined,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listProjects(ctx.rls, ctx.orgId, { limit: 500 }),
    listVendors(ctx.rls, ctx.orgId),
    ctx.rls
      .from("just_me_warehouses")
      .select("id, name")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const projectName = new Map(projects.rows.map((p) => [p.id, `${p.project_code} · ${p.name}`]));
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

  const rows: PrListRow[] = prPage.rows.map((pr) => ({
    id: pr.id,
    pr_code: pr.pr_code,
    status: pr.status,
    project_label: pr.project_id ? (projectName.get(pr.project_id) ?? "—") : "คลังกลาง",
    needed_date: pr.needed_date,
    vendor_label: pr.selected_vendor_id ? (vendorName.get(pr.selected_vendor_id) ?? "—") : null,
    total_estimated_cost: pr.total_estimated_cost,
    total_selected_cost: pr.total_selected_cost,
  }));

  return (
    <PurchaseRequestsClient
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canWrite={ctx.canWrite}
      rows={rows}
      total={prPage.total}
      page={page}
      pageSize={PAGE_SIZE}
      projectId={projectId}
      status={status}
      q={q}
      projectOptions={projects.rows.map((p) => ({
        value: p.id,
        label: `${p.project_code} · ${p.name}`,
      }))}
      warehouseOptions={((warehouses.data ?? []) as { id: string; name: string }[]).map((w) => ({
        value: w.id,
        label: w.name,
      }))}
    />
  );
}
