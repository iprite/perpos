/**
 * /api/just-me/purchase-requests/[id] — ใบขอซื้อหนึ่งใบ
 * ทุก method ต้องมี **cost-access** (owner/manager)
 * GET   = หัวใบ + บรรทัด + ใบเสนอราคาผู้ขาย + ยอดเทียบ BOQ
 * PATCH = `action`: `submit` | `approve` | `cancel` | `select-vendor`
 *         · ไม่ระบุ action → แก้หัวใบ/บรรทัด (เฉพาะใบที่ยัง draft/submitted)
 *
 * ⛔ สถานะขยับได้เฉพาะทางที่กำหนดไว้ที่นี่ — ห้ามให้ UI ส่ง `status` มาเอง
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError, pickFields } from "../../_lib";
import { getSettings } from "@/lib/just-me/price-book";
import {
  applyPrItems,
  getPurchaseRequest,
  listPurchaseRequestItems,
  listVendorQuoteItems,
  listVendorQuotes,
  loadBoqCompare,
  selectVendorForPr,
  PR_EDITABLE_STATUSES,
  type PrItemInput,
} from "@/lib/just-me/purchasing";

type Ctx = { params: Promise<{ id: string }> };

const EDITABLE = ["project_id", "boq_id", "warehouse_id", "needed_date", "note"] as const;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  try {
    const pr = await getPurchaseRequest(admin, g.orgId, id);
    if (!pr) return jmError("ไม่พบใบขอซื้อนี้", 404);

    const [items, quotes] = await Promise.all([
      listPurchaseRequestItems(admin, g.orgId, id),
      listVendorQuotes(admin, g.orgId, id),
    ]);
    const [quoteItems, boqCompare] = await Promise.all([
      listVendorQuoteItems(
        admin,
        g.orgId,
        quotes.map((q) => q.id),
      ),
      loadBoqCompare(admin, g.orgId, items),
    ]);

    return NextResponse.json({ pr, items, quotes, quoteItems, boqCompare, role: g.auth.role });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดใบขอซื้อไม่สำเร็จ", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const pr = await getPurchaseRequest(admin, g.orgId, id);
  if (!pr) return jmError("ไม่พบใบขอซื้อนี้", 404);
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "submit") {
    if (pr.status !== "draft") return jmError("ส่งขออนุมัติได้เฉพาะใบที่ยังเป็นฉบับร่าง", 409);
    const items = await listPurchaseRequestItems(admin, g.orgId, id);
    if (items.length === 0)
      return jmError("ใบขอซื้อยังไม่มีรายการ — เพิ่มรายการก่อนส่งขออนุมัติ", 400);
    return patchPr(req, admin, g, id, {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
  }

  if (action === "approve") {
    if (pr.status !== "submitted") return jmError("อนุมัติได้เฉพาะใบที่ส่งขออนุมัติแล้ว", 409);
    const settings = await getSettings(admin, g.orgId);
    if (settings.pr_approval_required && g.auth.role !== "owner") {
      return jmError("ใบขอซื้อต้องให้เจ้าของเป็นผู้อนุมัติ (ตั้งค่าไว้ในหน้าตั้งค่า)", 403);
    }
    return patchPr(req, admin, g, id, {
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: g.auth.userId,
    });
  }

  if (action === "cancel") {
    if (pr.status === "received") return jmError("ใบที่รับของครบแล้วยกเลิกไม่ได้", 409);
    if (pr.status === "cancelled") return jmError("ใบนี้ถูกยกเลิกไปแล้ว", 409);
    return patchPr(req, admin, g, id, { status: "cancelled" });
  }

  if (action === "select-vendor") {
    const quoteId = typeof body.quote_id === "string" ? body.quote_id : "";
    if (!quoteId) return jmError("ไม่ได้ระบุใบเสนอราคาที่เลือก", 400);
    await auditMutation(req, g.auth);
    const res = await selectVendorForPr(admin, { orgId: g.orgId, prId: id, quoteId });
    if (!res.ok) return jmError(res.error, res.status);
    return NextResponse.json({
      pr: res.pr,
      items: await listPurchaseRequestItems(admin, g.orgId, id),
      quotes: await listVendorQuotes(admin, g.orgId, id),
    });
  }

  // ── แก้หัวใบ/บรรทัด ───────────────────────────────────────────────────────
  if (!PR_EDITABLE_STATUSES.includes(pr.status)) {
    return jmError("ใบขอซื้อที่อนุมัติแล้วแก้ไม่ได้ — ให้ยกเลิกแล้วออกใบใหม่", 409);
  }

  const payload = pickFields(body, EDITABLE);
  if (Object.keys(payload).length > 0) {
    const refErr = await assertOrgRefs(g.orgId, [
      { value: payload.project_id, table: "just_me_projects", label: "โครงการ" },
      { value: payload.boq_id, table: "just_me_boqs", label: "BOQ" },
      { value: payload.warehouse_id, table: "just_me_warehouses", label: "คลังปลายทาง" },
    ]);
    if (refErr) return jmError(refErr, 400);
  }

  await auditMutation(req, g.auth);
  if (Object.keys(payload).length > 0) {
    const { error } = await admin
      .from("just_me_purchase_requests")
      .update(payload)
      .eq("org_id", g.orgId)
      .eq("id", id);
    if (error) return jmError(error.message, 500);
  }

  if (Array.isArray(body.items)) {
    const res = await applyPrItems(admin, {
      orgId: g.orgId,
      pr,
      inputs: body.items as PrItemInput[],
      userId: g.auth.userId,
      isOwner: g.auth.role === "owner",
      overBudgetReason:
        typeof body.over_budget_reason === "string" ? body.over_budget_reason : null,
    });
    if (!res.ok) return jmError(res.error, res.status);
  }

  const fresh = await getPurchaseRequest(admin, g.orgId, id);
  return NextResponse.json({
    pr: fresh,
    items: await listPurchaseRequestItems(admin, g.orgId, id),
  });
}

/** ขยับสถานะ + คืนใบที่อัปเดตแล้ว (ทุกทางเดินสถานะผ่านที่นี่ที่เดียว) */
async function patchPr(
  req: NextRequest,
  admin: ReturnType<typeof createAdminClient>,
  g: Extract<Awaited<ReturnType<typeof guard>>, { ok: true }>,
  id: string,
  patch: Record<string, unknown>,
): Promise<NextResponse> {
  await auditMutation(req, g.auth);
  const { data, error } = await admin
    .from("just_me_purchase_requests")
    .update(patch)
    .eq("org_id", g.orgId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return jmError(error.message, 500);
  if (!data) return jmError("สถานะใบขอซื้อเปลี่ยนไปแล้ว กรุณาโหลดใหม่", 409);
  return NextResponse.json({ pr: data });
}
