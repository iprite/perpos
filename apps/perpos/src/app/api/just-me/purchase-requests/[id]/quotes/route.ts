/**
 * /api/just-me/purchase-requests/[id]/quotes — ใบเสนอราคาผู้ขาย (ตารางเทียบราคา)
 * ทุก method ต้องมี **cost-access** (owner/manager)
 * GET   = ใบเสนอราคาทุกเจ้าของ PR นี้ + บรรทัดราคา
 * POST  = เพิ่มใบของผู้ขายรายใหม่ (พร้อมบรรทัดราคา) · PATCH = แก้ใบเดิม
 *
 * ⛔ `total_amount` คิดจากบรรทัดที่ `lib/just-me/purchasing.ts` — ห้ามรับยอดจาก body
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError, pickFields } from "../../../_lib";
import {
  getPurchaseRequest,
  listVendorQuoteItems,
  listVendorQuotes,
  saveVendorQuote,
} from "@/lib/just-me/purchasing";

type Ctx = { params: Promise<{ id: string }> };

const HEAD_FIELDS = ["quote_no", "quote_date", "delivery_days", "credit_terms", "note"] as const;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  try {
    const quotes = await listVendorQuotes(admin, g.orgId, id);
    const quoteItems = await listVendorQuoteItems(
      admin,
      g.orgId,
      quotes.map((q) => q.id),
    );
    return NextResponse.json({ quotes, quoteItems });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดใบเสนอราคาไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return upsert(req, ctx, "create");
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return upsert(req, ctx, "update");
}

async function upsert(req: NextRequest, ctx: Ctx, mode: "create" | "update") {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const pr = await getPurchaseRequest(admin, g.orgId, id);
  if (!pr) return jmError("ไม่พบใบขอซื้อนี้", 404);
  if (pr.status === "cancelled") return jmError("ใบขอซื้อที่ยกเลิกแล้วเพิ่มราคาไม่ได้", 409);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const head = pickFields(body, HEAD_FIELDS);
  if ("delivery_days" in head && head.delivery_days !== null) {
    const n = Number(head.delivery_days);
    if (!Number.isFinite(n) || n < 0) return jmError("จำนวนวันส่งของไม่ถูกต้อง", 400);
    head.delivery_days = Math.round(n);
  }

  const vendorId = typeof body.vendor_id === "string" ? body.vendor_id : null;
  const quoteId = typeof body.quote_id === "string" ? body.quote_id : null;
  if (mode === "create" && !vendorId) return jmError("กรุณาเลือกผู้ขาย", 400);
  if (mode === "update" && !quoteId) return jmError("ไม่ได้ระบุใบเสนอราคาที่จะแก้", 400);

  if (vendorId) {
    const refErr = await assertOrgRefs(g.orgId, [
      { value: vendorId, table: "just_me_vendors", label: "ผู้ขาย" },
    ]);
    if (refErr) return jmError(refErr, 400);
  }

  await auditMutation(req, g.auth);
  const res = await saveVendorQuote(admin, {
    orgId: g.orgId,
    prId: id,
    userId: g.auth.userId,
    quoteId: mode === "update" ? quoteId : null,
    vendorId,
    head,
    lines: Array.isArray(body.lines)
      ? (body.lines as { pr_item_id: string; unit_cost?: number | null; qty?: number | null }[])
      : undefined,
  });
  if (!res.ok) return jmError(res.error, res.status);

  const quotes = await listVendorQuotes(admin, g.orgId, id);
  const quoteItems = await listVendorQuoteItems(
    admin,
    g.orgId,
    quotes.map((q) => q.id),
  );
  return NextResponse.json(
    { quote: res.quote, quotes, quoteItems },
    {
      status: mode === "create" ? 201 : 200,
    },
  );
}
