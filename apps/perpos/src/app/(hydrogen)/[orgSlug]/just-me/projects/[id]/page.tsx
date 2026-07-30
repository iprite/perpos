/**
 * /[orgSlug]/just-me/projects/[id] — รายละเอียดโครงการ
 * ท่า: **hybrid** — server ดึงข้อมูลตั้งต้น (SSR) → client view เพราะเป็นหน้า CRUD หนัก
 * contract §5 ข้อ 2 · guard = member + RLS
 *
 * viewer: อ่านผ่าน view `*_basic` / `just_me_boq_items_sell` และ **ไม่ได้รับค่าต้นทุนใด ๆ ติดไปกับ props**
 * ⛔ ตัวเลขเงินมาจาก `lib/just-me/project-metrics.ts` เท่านั้น
 */

import { notFound } from "next/navigation";
import { listBoqItems, listBoqs } from "@/lib/just-me/boq";
import { listPriceBook, listWorkCategories } from "@/lib/just-me/price-book";
import { getProject, listProjectFiles, loadProjectSummaries } from "@/lib/just-me/projects";
import { listPrItems, listProjectPurchaseRequests, listVendors } from "@/lib/just-me/purchasing";
import type { JustMeBoqItem, JustMeWorkCategory } from "@/lib/just-me/types";
import { requireJustMePage } from "../../_components/guard";
import { ProjectDetailClient } from "./_detail-client";
import type { BoqPriceOption, ProjectPrRow } from "./_types";

export const dynamic = "force-dynamic";

export default async function JustMeProjectDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const ctx = await requireJustMePage(orgSlug);
  const basic = !ctx.canSeeCost;

  const project = await getProject(ctx.rls, ctx.orgId, id, { basic });
  if (!project) notFound();

  const [files, boqs] = await Promise.all([
    listProjectFiles(ctx.rls, ctx.orgId, id),
    listBoqs(ctx.rls, ctx.orgId, id, { basic }),
  ]);

  const activeBoq = boqs[0] ?? null;
  const [activeItems, summaryMap, categories, priceRows] = await Promise.all([
    activeBoq
      ? listBoqItems(ctx.rls, ctx.orgId, activeBoq.id, { basic })
      : Promise.resolve([] as JustMeBoqItem[]),
    ctx.canSeeCost
      ? loadProjectSummaries(ctx.rls, ctx.orgId, [project])
      : Promise.resolve(new Map()),
    ctx.canSeeCost
      ? listWorkCategories(ctx.rls, ctx.orgId)
      : Promise.resolve([] as JustMeWorkCategory[]),
    ctx.canSeeCost ? listPriceBook(ctx.rls, ctx.orgId) : Promise.resolve([]),
  ]);

  // แท็บ "จัดซื้อ" — ข้อมูลต้นทุนล้วน จึงดึงเฉพาะเมื่อผู้ใช้มีสิทธิ์เห็น (viewer ได้ [] และไม่เห็นแท็บ)
  let purchaseRequests: ProjectPrRow[] = [];
  if (ctx.canSeeCost) {
    const [prs, vendors] = await Promise.all([
      listProjectPurchaseRequests(ctx.rls, ctx.orgId, id, { includeCancelled: true }),
      listVendors(ctx.rls, ctx.orgId, { includeInactive: true }),
    ]);
    const prItems = await listPrItems(
      ctx.rls,
      ctx.orgId,
      prs.map((p) => p.id),
    );
    const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
    purchaseRequests = prs.map((pr) => {
      const lines = prItems.filter((i) => i.pr_id === pr.id);
      return {
        id: pr.id,
        pr_code: pr.pr_code,
        status: pr.status,
        needed_date: pr.needed_date,
        vendor_name: pr.selected_vendor_id ? (vendorName.get(pr.selected_vendor_id) ?? null) : null,
        total_estimated_cost: pr.total_estimated_cost,
        total_selected_cost: pr.total_selected_cost,
        item_count: lines.length,
        received_count: lines.filter((l) => (l.received_qty ?? 0) + 0.0001 >= (l.qty ?? 0)).length,
      };
    });
  }

  const priceOptions: BoqPriceOption[] = priceRows.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    category_id: r.category_id,
    material_unit_cost: r.effective_material_cost,
    labor_unit_cost: r.labor_unit_cost,
    overhead_unit_cost: r.overhead_unit_cost,
  }));

  return (
    <ProjectDetailClient
      orgId={ctx.orgId}
      orgSlug={orgSlug}
      canWrite={ctx.canWrite}
      canSeeCost={ctx.canSeeCost}
      initial={{
        project,
        files,
        boqs,
        activeBoqId: activeBoq?.id ?? null,
        activeItems,
        summary: summaryMap.get(project.id) ?? null,
        categories,
        priceOptions,
        purchaseRequests,
      }}
    />
  );
}
