/**
 * /api/just-me/projects/[id]/boq — BOQ ของโครงการ (รายฉบับ/revision)
 * GET  = สมาชิก · viewer ได้หัว BOQ ที่ตัด `total_cost` ออกแล้ว (ราคาขายยังเห็นได้)
 * POST = owner/manager (cost-access) · สร้าง revision ใหม่ + คัดลอกบรรทัดจากฉบับเดิมได้ใน 1 คำสั่ง
 *
 * กติกา: 1 โครงการมีฉบับร่างได้ครั้งละ 1 ฉบับ (กันร่างค้างหลายใบจนไม่รู้ว่าใบไหนจริง)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { auditMutation, guard, jmError, stripCost } from "../../../_lib";
import { getProject } from "@/lib/just-me/projects";
import { listBoqItems, listBoqs } from "@/lib/just-me/boq";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const project = await getProject(admin, g.orgId, id);
  if (!project) return jmError("ไม่พบโครงการนี้", 404);

  try {
    const boqs = await listBoqs(admin, g.orgId, id);
    return NextResponse.json({
      boqs: boqs.map((b) => stripCost(b as unknown as Record<string, unknown>, g.auth.role)),
      role: g.auth.role,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลด BOQ ไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const project = await getProject(admin, g.orgId, id);
  if (!project) return jmError("ไม่พบโครงการนี้", 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const existing = await listBoqs(admin, g.orgId, id);
  const draft = existing.find((b) => b.status === "draft");
  if (draft) {
    return jmError(
      `โครงการนี้มีฉบับร่างอยู่แล้ว (ฉบับที่ ${draft.revision_no}) — แก้ฉบับร่างเดิมหรือลบก่อนสร้างใหม่`,
      409,
    );
  }

  // บรรทัดต้นทางที่จะคัดลอก (ต้องเป็น BOQ ของโครงการเดียวกันใน org เดียวกัน)
  let sourceItems: Record<string, unknown>[] = [];
  const copyFrom = typeof body.copy_from_boq_id === "string" ? body.copy_from_boq_id : null;
  if (copyFrom) {
    const source = existing.find((b) => b.id === copyFrom);
    if (!source) return jmError("ไม่พบ BOQ ต้นทางที่จะคัดลอกในโครงการนี้", 404);
    const items = await listBoqItems(admin, g.orgId, copyFrom);
    sourceItems = items.map((it) => ({
      org_id: g.orgId,
      category_id: it.category_id,
      price_book_id: it.price_book_id,
      item_id: it.item_id,
      item_kind: it.item_kind,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      material_unit_cost: it.material_unit_cost,
      labor_unit_cost: it.labor_unit_cost,
      overhead_unit_cost: it.overhead_unit_cost,
      margin_pct: it.margin_pct,
      margin_source: it.margin_source,
      unit_price: it.unit_price,
      amount: it.amount,
      cost_amount: it.cost_amount,
      sort_order: it.sort_order ?? 0,
      created_by: g.auth.userId,
    }));
  }

  await auditMutation(req, g.auth);

  // revision_no unique ต่อโครงการ → ชนแล้วขยับเลขแล้วลองใหม่ (ไม่มีทางได้เลขซ้ำ)
  let revision = existing.reduce((max, b) => Math.max(max, b.revision_no), 0);
  let boq: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 5 && !boq; attempt++) {
    revision += 1;
    const { data, error } = await admin
      .from("just_me_boqs")
      .insert({
        org_id: g.orgId,
        project_id: id,
        revision_no: revision,
        status: "draft",
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : null,
        note: typeof body.note === "string" ? body.note : null,
        created_by: g.auth.userId,
      })
      .select("*")
      .single();
    if (!error && data) {
      boq = data as Record<string, unknown>;
      break;
    }
    if (error?.code !== "23505") return jmError(error?.message ?? "สร้าง BOQ ไม่สำเร็จ", 500);
  }
  if (!boq) return jmError("สร้าง BOQ ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 409);

  if (sourceItems.length > 0) {
    const { error: itemErr } = await admin
      .from("just_me_boq_items")
      .insert(sourceItems.map((it) => ({ ...it, boq_id: boq!.id })));
    if (itemErr) {
      // คัดลอกไม่สำเร็จ = ทิ้งหัวที่เพิ่งสร้าง (ยัง draft จึงลบได้) ไม่ให้เหลือฉบับร่างเปล่า
      await admin
        .from("just_me_boqs")
        .delete()
        .eq("id", boq.id as string)
        .eq("org_id", g.orgId);
      return jmError(`คัดลอกรายการจากฉบับเดิมไม่สำเร็จ: ${itemErr.message}`, 500);
    }
  }

  return NextResponse.json(
    { boq: stripCost(boq, g.auth.role), copied_items: sourceItems.length },
    { status: 201 },
  );
}
