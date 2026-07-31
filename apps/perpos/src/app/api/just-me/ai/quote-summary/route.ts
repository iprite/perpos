/**
 * POST /api/just-me/ai/quote-summary — ให้ AI สรุปการเทียบราคาผู้ขายของใบขอซื้อหนึ่งใบ
 * สิทธิ์: cost-access (owner/manager) — viewer เรียกไม่ได้ (403)
 *
 * ⛔ AI **ไม่เลือกผู้ขายให้** และ route นี้ **ไม่เขียนอะไรลง DB เลย** (อ่านอย่างเดียว)
 *    ตัวเลขทั้งหมดคิดด้วย `compareVendorQuotes()` ก่อน แล้วส่งผลลัพธ์ให้ AI เรียบเรียงเท่านั้น
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { guard, jmError } from "../../_lib";
import { summarizeVendorQuotes } from "@/lib/just-me/ai";
import { compareVendorQuotes } from "@/lib/just-me/project-metrics";
import { getProject } from "@/lib/just-me/projects";
import {
  getPurchaseRequest,
  listPurchaseRequestItems,
  listVendorQuoteItems,
  listVendorQuotes,
  listVendors,
} from "@/lib/just-me/purchasing";

export async function POST(req: NextRequest) {
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const prId = typeof body.pr_id === "string" ? body.pr_id : "";
  if (!prId) return jmError("ไม่ได้ระบุใบขอซื้อ", 400);

  const admin = createAdminClient();
  try {
    const pr = await getPurchaseRequest(admin, g.orgId, prId);
    if (!pr) return jmError("ไม่พบใบขอซื้อนี้", 404);

    const [items, quotes, vendors] = await Promise.all([
      listPurchaseRequestItems(admin, g.orgId, prId),
      listVendorQuotes(admin, g.orgId, prId),
      listVendors(admin, g.orgId, { includeInactive: true }),
    ]);
    const quoteItems = await listVendorQuoteItems(
      admin,
      g.orgId,
      quotes.map((q) => q.id),
    );
    const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

    const comparison = compareVendorQuotes({
      items: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty })),
      quotes: quotes.map((q) => ({
        id: q.id,
        vendor_name: vendorName.get(q.vendor_id) ?? "ผู้ขาย",
        status: q.status,
        total_amount: q.total_amount,
        delivery_days: q.delivery_days,
        credit_terms: q.credit_terms,
      })),
      quoteItems: quoteItems.map((l) => ({
        quote_id: l.quote_id,
        pr_item_id: l.pr_item_id,
        unit_cost: l.unit_cost,
      })),
    });

    const project = pr.project_id ? await getProject(admin, g.orgId, pr.project_id) : null;
    const opinion = await summarizeVendorQuotes(comparison, {
      prCode: pr.pr_code,
      projectName: project?.name ?? null,
    });

    return NextResponse.json({ comparison, opinion });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "สรุปการเทียบราคาไม่สำเร็จ", 500);
  }
}
