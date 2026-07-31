/**
 * /api/just-me/boq/[boqId] — หัว BOQ
 * GET   = สมาชิก (viewer ได้ฉบับที่ตัด `total_cost` ออก + บรรทัดเฉพาะฝั่งราคาขาย)
 * PATCH = owner/manager (cost-access)
 *          · `action:"approve"` → freeze ยอด + เขียน baseline งบของโครงการ
 *          · ไม่ระบุ action → แก้ชื่อ/หมายเหตุของฉบับร่าง
 *
 * ⛔ ยอดรวมคำนวณจากบรรทัดจริงฝั่ง server เสมอ — ห้ามรับยอดจาก body
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { auditMutation, guard, jmError, stripCost, stripCostList } from "../../_lib";
import { approveBoq, getBoq, listBoqItems } from "@/lib/just-me/boq";

type Ctx = { params: Promise<{ boqId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { boqId } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  try {
    const boq = await getBoq(admin, g.orgId, boqId);
    if (!boq) return jmError("ไม่พบ BOQ ฉบับนี้", 404);
    const items = await listBoqItems(admin, g.orgId, boqId);
    return NextResponse.json({
      boq: stripCost(boq as unknown as Record<string, unknown>, g.auth.role),
      items: stripCostList(items as unknown as Record<string, unknown>[], g.auth.role),
      role: g.auth.role,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลด BOQ ไม่สำเร็จ", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { boqId } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "approve") {
    await auditMutation(req, g.auth);
    const res = await approveBoq(admin, {
      orgId: g.orgId,
      boqId,
      userId: g.auth.userId,
    });
    if (!res.ok) return jmError(res.error, res.status);
    return NextResponse.json({
      boq: res.result.boq,
      budget_cost: res.result.budget_cost,
      contract_amount: res.result.contract_amount,
      counted: res.result.counted,
    });
  }

  const boq = await getBoq(admin, g.orgId, boqId);
  if (!boq) return jmError("ไม่พบ BOQ ฉบับนี้", 404);
  if (boq.status !== "draft") {
    return jmError("BOQ ที่อนุมัติแล้วแก้ไม่ได้ — ให้สร้าง revision ใหม่แทน", 409);
  }

  const patch: Record<string, unknown> = {};
  if ("title" in body) {
    patch.title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  }
  if ("note" in body) patch.note = typeof body.note === "string" ? body.note : null;
  if (Object.keys(patch).length === 0) return jmError("ไม่มีข้อมูลที่จะแก้ไข", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await admin
    .from("just_me_boqs")
    .update(patch)
    .eq("org_id", g.orgId)
    .eq("id", boqId)
    .select("*")
    .single();
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ boq: stripCost(data as Record<string, unknown>, g.auth.role) });
}
