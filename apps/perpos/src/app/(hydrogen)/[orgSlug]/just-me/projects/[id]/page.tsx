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
import { ProjectDetailClient, type TabKey } from "./_detail-client";
import type { AccountingLink, BoqPriceOption, ProjectPrRow } from "./_types";

export const dynamic = "force-dynamic";

/** แท็บที่เปิดได้จากลิงก์ภายนอก (การ์ด LINE ส่ง `?tab=billings` มา) */
const DEEP_LINK_TABS: TabKey[] = ["overview", "files", "boq", "purchasing", "billings", "usage"];

export default async function JustMeProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgSlug, id } = await params;
  const { tab } = await searchParams;
  const initialTab = DEEP_LINK_TABS.find((t) => t === tab);
  const ctx = await requireJustMePage(orgSlug);
  const basic = !ctx.canSeeCost;

  // ── รอบที่ 1: ทุกอย่างที่ไม่ต้องรอผลของกันและกัน ยิงพร้อมกันครั้งเดียว ──
  //    ⛔ ห้ามแตกกลับไปเป็น await ทีละก้อน — เดิมหน้านี้ไล่ยิง 10 รอบต่อกัน
  //    (แต่ละรอบ = 1 round-trip ไป Supabase) ⇒ เสียเวลาไปกับ latency ล้วน ๆ ก่อนหน้าจะขึ้น
  const [
    project,
    files,
    boqs,
    categories,
    priceRows,
    prs,
    vendors,
    billings,
    usage,
    progress,
    approvedItems,
    readiness,
    costs,
  ] = await Promise.all([
    getProject(ctx.rls, ctx.orgId, id, { basic }),
    listProjectFiles(ctx.rls, ctx.orgId, id),
    listBoqs(ctx.rls, ctx.orgId, id, { basic }),
    // ข้อมูลต้นทุนล้วน — viewer ไม่ต้องดึงเลย (และไม่เห็นแท็บนั้นอยู่แล้ว)
    ctx.canSeeCost
      ? listWorkCategories(ctx.rls, ctx.orgId)
      : Promise.resolve([] as JustMeWorkCategory[]),
    ctx.canSeeCost ? listPriceBook(ctx.rls, ctx.orgId) : Promise.resolve([]),
    ctx.canSeeCost
      ? listProjectPurchaseRequests(ctx.rls, ctx.orgId, id, { includeCancelled: true })
      : Promise.resolve([]),
    ctx.canSeeCost
      ? listVendors(ctx.rls, ctx.orgId, { includeInactive: true })
      : Promise.resolve([]),
    listProjectBillings(ctx.rls, ctx.orgId, id),
    listProjectUsage(ctx.rls, ctx.orgId, id, { basic }),
    listProjectProgress(ctx.rls, ctx.orgId, id),
    listApprovedBoqItems(ctx.rls, ctx.orgId, id, { basic }),
    loadAccountingReadiness(ctx.rls, ctx.orgId),
    ctx.canSeeCost
      ? listProjectCosts(ctx.rls, ctx.orgId, id)
      : Promise.resolve([] as JustMeProjectCost[]),
  ]);
  if (!project) notFound();

  const activeBoq = boqs[0] ?? null;
  const usageItemIds = Array.from(new Set(usage.map((u) => u.item_id).filter(Boolean)));

  // ── รอบที่ 2: เฉพาะของที่ต้องรู้ผลรอบแรกก่อน (id ของ BOQ / PR / เอกสาร / วัสดุ) ──
  const [activeItems, prItems, summaryMap, documents, itemRows] = await Promise.all([
    activeBoq
      ? listBoqItems(ctx.rls, ctx.orgId, activeBoq.id, { basic })
      : Promise.resolve([] as JustMeBoqItem[]),
    prs.length > 0
      ? listPrItems(
          ctx.rls,
          ctx.orgId,
          prs.map((pr) => pr.id),
        )
      : Promise.resolve([]),
    ctx.canSeeCost
      ? loadProjectSummaries(ctx.rls, ctx.orgId, [project])
      : Promise.resolve(new Map()),
    loadDocumentNumbers(ctx.rls, ctx.orgId, [
      project.quotation_document_id,
      ...billings.map((b) => b.invoice_document_id),
    ]),
    usageItemIds.length > 0
      ? ctx.rls
          .from("just_me_inventory_items")
          .select("id, name")
          .eq("org_id", ctx.orgId)
          .in("id", usageItemIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  const purchaseRequests: ProjectPrRow[] = prs.map((pr) => {
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

  const billingTotals = billingPlanTotals(project.contract_amount, billings);

  // ชื่อวัสดุของแถวเบิก (แถวคลังเก็บแค่ item_id)
  const itemNames: Record<string, string> = {};
  for (const row of (itemRows.data ?? []) as { id: string; name: string }[]) {
    itemNames[row.id] = row.name;
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
      initialTab={initialTab}
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
