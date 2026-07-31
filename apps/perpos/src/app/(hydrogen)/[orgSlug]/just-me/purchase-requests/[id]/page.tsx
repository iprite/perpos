/**
 * /[orgSlug]/just-me/purchase-requests/[id] — รายละเอียดใบขอซื้อ
 * ท่า: **hybrid** — server ดึงข้อมูลตั้งต้น → client view (CRUD หนัก: บรรทัด/เทียบราคา/รับของ)
 * contract §5 ข้อ 5 · guard = member + RLS
 *
 * ⛔ viewer เข้าไม่ได้เลย (ทั้งใบเป็นข้อมูลต้นทุน) · ยอดเงินคิดมาจาก `project-metrics.ts` แล้ว
 */

import { notFound } from "next/navigation";
import { Lock, ShoppingCart } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Text } from "@/components/ui/typography";
import { listApprovedBoqItems } from "@/lib/just-me/boq";
import { getSettings, listInventoryItemOptions } from "@/lib/just-me/price-book";
import { getProject } from "@/lib/just-me/projects";
import {
  getPurchaseRequest,
  listPurchaseRequestItems,
  listVendorQuoteItems,
  listVendorQuotes,
  listVendors,
  loadBoqCompare,
  sumPrQtyByBoqItem,
} from "@/lib/just-me/purchasing";
import { requireJustMePage } from "../../_components/guard";
import { PrDetailClient } from "./_pr-detail-client";
import type { BoqPickRow } from "./_types";

export const dynamic = "force-dynamic";

export default async function JustMePurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
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

  const pr = await getPurchaseRequest(ctx.rls, ctx.orgId, id);
  if (!pr) notFound();

  const [items, quotes, vendors, settings, inventory, warehouses, project] = await Promise.all([
    listPurchaseRequestItems(ctx.rls, ctx.orgId, id),
    listVendorQuotes(ctx.rls, ctx.orgId, id),
    listVendors(ctx.rls, ctx.orgId),
    getSettings(ctx.rls, ctx.orgId),
    listInventoryItemOptions(ctx.rls, ctx.orgId),
    ctx.rls
      .from("just_me_warehouses")
      .select("id, name")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("name"),
    pr.project_id ? getProject(ctx.rls, ctx.orgId, pr.project_id) : Promise.resolve(null),
  ]);

  const [quoteItems, boqCompare, boqItems] = await Promise.all([
    listVendorQuoteItems(
      ctx.rls,
      ctx.orgId,
      quotes.map((q) => q.id),
    ),
    loadBoqCompare(ctx.rls, ctx.orgId, items),
    pr.project_id ? listApprovedBoqItems(ctx.rls, ctx.orgId, pr.project_id) : Promise.resolve([]),
  ]);

  // บรรทัด BOQ ที่ยังเหลือให้สั่งซื้อ (ยอดสั่งสะสมนับจาก PR ทุกใบที่ยังไม่ยกเลิก)
  const orderedByBoqItem = await sumPrQtyByBoqItem(
    ctx.rls,
    ctx.orgId,
    boqItems.map((b) => b.id),
  );
  const boqPicks: BoqPickRow[] = boqItems.map((b) => {
    const ordered = orderedByBoqItem.get(b.id) ?? 0;
    return {
      boq_item_id: b.id,
      name: b.name,
      unit: b.unit,
      qty: b.qty,
      ordered_qty: ordered,
      remaining_qty: Math.max(b.qty - ordered, 0),
      item_id: b.item_id,
      material_unit_cost: b.material_unit_cost,
    };
  });

  return (
    <PrDetailClient
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canWrite={ctx.canWrite}
      isOwner={ctx.role === "owner"}
      initial={{
        pr,
        items,
        quotes,
        quoteItems,
        boqCompare,
        boqPicks,
        projectLabel: project ? `${project.project_code} · ${project.name}` : null,
        vendorOptions: vendors.map((v) => ({ value: v.id, label: v.name })),
        warehouseOptions: ((warehouses.data ?? []) as { id: string; name: string }[]).map((w) => ({
          value: w.id,
          label: w.name,
        })),
        inventoryOptions: inventory.map((i) => ({
          value: i.id,
          label: `${i.code} · ${i.name}`,
        })),
        approvalRequired: settings.pr_approval_required,
      }}
    />
  );
}
