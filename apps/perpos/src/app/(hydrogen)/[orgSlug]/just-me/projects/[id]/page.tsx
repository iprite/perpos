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
import type { JustMeBoqItem, JustMeWorkCategory } from "@/lib/just-me/types";
import { requireJustMePage } from "../../_components/guard";
import { ProjectDetailClient } from "./_detail-client";
import type { BoqPriceOption } from "./_types";

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
      }}
    />
  );
}
