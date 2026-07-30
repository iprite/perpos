/**
 * /[orgSlug]/just-me/projects/[id] — รายละเอียดโครงการ
 * ท่า: **hybrid** — server ดึงข้อมูลตั้งต้น (SSR) → client view เพราะเป็นหน้า CRUD หนัก
 * contract §5 ข้อ 2 · guard = member + RLS
 *
 * viewer: อ่านผ่าน view `*_basic` / `just_me_boq_items_sell` และ **ไม่ได้รับค่าต้นทุนใด ๆ ติดไปกับ props**
 * ⛔ ตัวเลขเงินมาจาก `lib/just-me/project-metrics.ts` เท่านั้น
 */

import { notFound } from "next/navigation";
import { listApprovedBoqItems, listBoqItems, listBoqs } from "@/lib/just-me/boq";
import { listPriceBook, listWorkCategories } from "@/lib/just-me/price-book";
import {
  getProject,
  listProjectBillings,
  listProjectCosts,
  listProjectFiles,
  listProjectProgress,
  listProjectUsage,
  loadProjectSummaries,
} from "@/lib/just-me/projects";
import { listPrItems, listProjectPurchaseRequests, listVendors } from "@/lib/just-me/purchasing";
import { billingPlanTotals } from "@/lib/just-me/project-metrics";
import { loadAccountingReadiness, loadDocumentNumbers } from "@/lib/just-me/accounting-bridge";
import type { JustMeBoqItem, JustMeProjectCost, JustMeWorkCategory } from "@/lib/just-me/types";
import { requireJustMePage } from "../../_components/guard";
import { ProjectDetailClient } from "./_detail-client";
import type { AccountingLink, BoqPriceOption, ProjectPrRow } from "./_types";

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

  // ── B5: งวดงาน / ใช้จริง / สะพานเชื่อมระบบบัญชี ──
  const [billings, usage, progress, approvedItems, readiness] = await Promise.all([
    listProjectBillings(ctx.rls, ctx.orgId, id),
    listProjectUsage(ctx.rls, ctx.orgId, id, { basic }),
    listProjectProgress(ctx.rls, ctx.orgId, id),
    listApprovedBoqItems(ctx.rls, ctx.orgId, id, { basic }),
    loadAccountingReadiness(ctx.rls, ctx.orgId),
  ]);
  // ต้นทุนนอกคลัง = ข้อมูลต้นทุน → ดึงเฉพาะผู้ที่มีสิทธิ์เห็น
  const costs: JustMeProjectCost[] = ctx.canSeeCost
    ? await listProjectCosts(ctx.rls, ctx.orgId, id)
    : [];

  const billingTotals = billingPlanTotals(project.contract_amount, billings);
  const documents = await loadDocumentNumbers(ctx.rls, ctx.orgId, [
    project.quotation_document_id,
    ...billings.map((b) => b.invoice_document_id),
  ]);

  // ชื่อวัสดุของแถวเบิก (แถวคลังเก็บแค่ item_id)
  const itemIds = Array.from(new Set(usage.map((u) => u.item_id).filter(Boolean)));
  const itemNames: Record<string, string> = {};
  if (itemIds.length > 0) {
    const { data: itemRows } = await ctx.rls
      .from("just_me_inventory_items")
      .select("id, name")
      .eq("org_id", ctx.orgId)
      .in("id", itemIds);
    for (const row of (itemRows ?? []) as { id: string; name: string }[]) {
      itemNames[row.id] = row.name;
    }
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
        billings,
        billingPlanned: billingTotals.planned,
        billingRemaining: billingTotals.remaining,
        documents: Object.fromEntries(documents) as Record<string, AccountingLink>,
        accounting: {
          configured: readiness.configured,
          vatRegistered: readiness.vat_registered,
          taxIdentityMissing: readiness.tax_identity_ready ? [] : readiness.missing,
        },
        usage,
        itemNames,
        costs,
        progress,
        approvedItems: approvedItems.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          qty: i.qty,
        })),
      }}
    />
  );
}
