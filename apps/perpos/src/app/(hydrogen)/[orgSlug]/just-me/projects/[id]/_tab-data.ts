/**
 * _tab-data.ts — ตัวโหลดข้อมูล "รายแท็บ" ของหน้ารายละเอียดโครงการ
 *
 * ⛔ หน้าเดิมดึงข้อมูลของทุกแท็บตั้งแต่เปิดหน้า (BOQ + จัดซื้อ + งวดงาน + เบิกใช้ + ไฟล์)
 *    ทั้งที่ผู้ใช้เห็นทีละแท็บ ⇒ จ่ายค่า query ของแท็บที่ไม่ได้เปิดทุกครั้ง
 *    ตอนนี้ SSR โหลดเฉพาะแท็บแรก · แท็บอื่นโหลดตอนกด (ผ่าน `loadProjectTabAction`)
 *
 * 🔴 ทุกฟังก์ชันในไฟล์นี้รับ `ctx` ที่ผ่าน `requireJustMePage` มาแล้วเท่านั้น
 *    (viewer ต้องไม่ได้รับข้อมูลต้นทุนเลย — เงื่อนไข `ctx.canSeeCost` ต้องอยู่ครบทุกก้อน)
 */
import "server-only";

import { listApprovedBoqItems, listBoqItems, listBoqs } from "@/lib/just-me/boq";
import { listPriceBook, listWorkCategories } from "@/lib/just-me/price-book";
import {
  listProjectBillings,
  listProjectCosts,
  listProjectFiles,
  listProjectProgress,
  listProjectUsage,
} from "@/lib/just-me/projects";
import { listPrItems, listProjectPurchaseRequests, listVendors } from "@/lib/just-me/purchasing";
import { billingPlanTotals } from "@/lib/just-me/project-metrics";
import { loadDocumentNumbers } from "@/lib/just-me/accounting-bridge";
import type { JustMeProject, JustMeWorkCategory } from "@/lib/just-me/types";
import type { JustMePageContext } from "../../_components/guard";
import type {
  AccountingLink,
  BoqPriceOption,
  ProjectPrRow,
  ProjectTabData,
  TabKey,
} from "./_types";

export async function loadProjectTabData(
  ctx: JustMePageContext,
  project: JustMeProject,
  tab: TabKey,
): Promise<ProjectTabData> {
  const basic = !ctx.canSeeCost;
  const id = project.id;

  if (tab === "files") {
    return { files: await listProjectFiles(ctx.rls, ctx.orgId, id) };
  }

  if (tab === "boq") {
    const boqs = await listBoqs(ctx.rls, ctx.orgId, id, { basic });
    const activeBoq = boqs[0] ?? null;
    const [activeItems, categories, priceRows, documents] = await Promise.all([
      activeBoq ? listBoqItems(ctx.rls, ctx.orgId, activeBoq.id, { basic }) : Promise.resolve([]),
      ctx.canSeeCost
        ? listWorkCategories(ctx.rls, ctx.orgId)
        : Promise.resolve([] as JustMeWorkCategory[]),
      ctx.canSeeCost ? listPriceBook(ctx.rls, ctx.orgId) : Promise.resolve([]),
      loadDocumentNumbers(ctx.rls, ctx.orgId, [project.quotation_document_id]),
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
    return {
      boqs,
      activeBoqId: activeBoq?.id ?? null,
      activeItems,
      categories,
      priceOptions,
      quotationDoc: project.quotation_document_id
        ? ((documents.get(project.quotation_document_id) as AccountingLink | undefined) ?? null)
        : null,
    };
  }

  if (tab === "purchasing") {
    // ข้อมูลต้นทุนล้วน — viewer ไม่เห็นแท็บนี้อยู่แล้ว และต้องไม่ได้ข้อมูลติดไปด้วย
    if (!ctx.canSeeCost) return { purchaseRequests: [] };
    const [prs, vendors] = await Promise.all([
      listProjectPurchaseRequests(ctx.rls, ctx.orgId, id, { includeCancelled: true }),
      listVendors(ctx.rls, ctx.orgId, { includeInactive: true }),
    ]);
    const prItems =
      prs.length > 0
        ? await listPrItems(
            ctx.rls,
            ctx.orgId,
            prs.map((pr) => pr.id),
          )
        : [];
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
    return { purchaseRequests };
  }

  if (tab === "billings") {
    const billings = await listProjectBillings(ctx.rls, ctx.orgId, id);
    const documents = await loadDocumentNumbers(ctx.rls, ctx.orgId, [
      project.quotation_document_id,
      ...billings.map((b) => b.invoice_document_id),
    ]);
    const totals = billingPlanTotals(project.contract_amount, billings);
    return {
      billings,
      billingPlanned: totals.planned,
      billingRemaining: totals.remaining,
      documents: Object.fromEntries(documents) as Record<string, AccountingLink>,
    };
  }

  if (tab === "usage") {
    const [usage, costs, progress, approvedItems] = await Promise.all([
      listProjectUsage(ctx.rls, ctx.orgId, id, { basic }),
      ctx.canSeeCost ? listProjectCosts(ctx.rls, ctx.orgId, id) : Promise.resolve([]),
      listProjectProgress(ctx.rls, ctx.orgId, id),
      listApprovedBoqItems(ctx.rls, ctx.orgId, id, { basic }),
    ]);

    // ชื่อวัสดุของแถวเบิก (แถวคลังเก็บแค่ item_id)
    const itemIds = Array.from(new Set(usage.map((u) => u.item_id).filter(Boolean)));
    const itemNames: Record<string, string> = {};
    if (itemIds.length > 0) {
      const { data } = await ctx.rls
        .from("just_me_inventory_items")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .in("id", itemIds);
      for (const row of (data ?? []) as { id: string; name: string }[]) {
        itemNames[row.id] = row.name;
      }
    }

    return {
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
    };
  }

  return {};
}
