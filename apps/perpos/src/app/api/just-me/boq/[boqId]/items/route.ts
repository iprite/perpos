/**
 * /api/just-me/boq/[boqId]/items — บรรทัด BOQ (รองรับหลายรายการต่อคำสั่ง)
 * GET    = สมาชิก · viewer เห็นเฉพาะ qty + ราคาขาย (ต้นทุน/margin ถูกตัดออก)
 * POST   = เพิ่มบรรทัด (`items: []` หรือส่งบรรทัดเดียวก็ได้)
 * PATCH  = แก้บรรทัด (`items: [{ id, ... }]`) — คำนวณยอดใหม่ฝั่ง server ทุกครั้ง
 * DELETE = `?itemId=` หรือ body `{ ids: [] }`
 *
 * ⛔ แก้ได้เฉพาะฉบับที่ยัง `draft` (trigger ที่ DB กันอีกชั้น — ที่นี่ทำให้ error เป็นภาษาคน)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError, stripCostList } from "../../../_lib";
import { getBoq, listBoqItems, prepareBoqItemRows, type BoqItemInput } from "@/lib/just-me/boq";

type Ctx = { params: Promise<{ boqId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { boqId } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const boq = await getBoq(admin, g.orgId, boqId);
  if (!boq) return jmError("ไม่พบ BOQ ฉบับนี้", 404);

  try {
    const items = await listBoqItems(admin, g.orgId, boqId);
    return NextResponse.json({
      items: stripCostList(items as unknown as Record<string, unknown>[], g.auth.role),
      role: g.auth.role,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดรายการ BOQ ไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { boqId } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const boq = await getBoq(admin, g.orgId, boqId);
  if (!boq) return jmError("ไม่พบ BOQ ฉบับนี้", 404);
  if (boq.status !== "draft") {
    return jmError("BOQ ฉบับนี้ไม่ใช่ฉบับร่างแล้ว — ให้สร้าง revision ใหม่ก่อนแก้", 409);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const inputs = readItems(body);
  if (inputs.length === 0) return jmError("ไม่มีรายการที่จะบันทึก", 400);

  const refErr = await checkRefs(g.orgId, inputs);
  if (refErr) return jmError(refErr, 400);

  const prepared = await prepareBoqItemRows(admin, {
    orgId: g.orgId,
    projectId: boq.project_id,
    inputs,
  });
  if (!prepared.ok) return jmError(prepared.error, 400);

  await auditMutation(req, g.auth);
  const { data, error } = await admin
    .from("just_me_boq_items")
    .insert(
      prepared.rows.map((r) => ({
        ...r,
        org_id: g.orgId,
        boq_id: boqId,
        created_by: g.auth.userId,
      })),
    )
    .select("*");
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ items: data ?? [], created: (data ?? []).length }, { status: 201 });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { boqId } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const boq = await getBoq(admin, g.orgId, boqId);
  if (!boq) return jmError("ไม่พบ BOQ ฉบับนี้", 404);
  if (boq.status !== "draft") {
    return jmError("BOQ ฉบับนี้ไม่ใช่ฉบับร่างแล้ว — ให้สร้าง revision ใหม่ก่อนแก้", 409);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = readItems(body);
  const ids = raw.map((i) => (i as BoqItemInput & { id?: string }).id).filter(Boolean) as string[];
  if (ids.length !== raw.length || ids.length === 0) {
    return jmError("ทุกรายการที่แก้ต้องระบุ id", 400);
  }

  const existing = await listBoqItems(admin, g.orgId, boqId);
  const known = new Set(existing.map((i) => i.id));
  const alien = ids.filter((id) => !known.has(id));
  if (alien.length > 0) return jmError("มีรายการที่ไม่ได้อยู่ใน BOQ ฉบับนี้", 400);

  const refErr = await checkRefs(g.orgId, raw);
  if (refErr) return jmError(refErr, 400);

  const prepared = await prepareBoqItemRows(admin, {
    orgId: g.orgId,
    projectId: boq.project_id,
    inputs: raw,
  });
  if (!prepared.ok) return jmError(prepared.error, 400);

  await auditMutation(req, g.auth);
  const updated: unknown[] = [];
  for (let i = 0; i < ids.length; i++) {
    const { data, error } = await admin
      .from("just_me_boq_items")
      .update(prepared.rows[i])
      .eq("org_id", g.orgId)
      .eq("boq_id", boqId)
      .eq("id", ids[i])
      .select("*")
      .single();
    if (error) return jmError(error.message, 500);
    updated.push(data);
  }
  return NextResponse.json({ items: updated, updated: updated.length });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { boqId } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const boq = await getBoq(admin, g.orgId, boqId);
  if (!boq) return jmError("ไม่พบ BOQ ฉบับนี้", 404);
  if (boq.status !== "draft") {
    return jmError("BOQ ฉบับนี้ไม่ใช่ฉบับร่างแล้ว — ลบรายการไม่ได้", 409);
  }

  const single = req.nextUrl.searchParams.get("itemId");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = single
    ? [single]
    : Array.isArray(body.ids)
      ? (body.ids as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
  if (ids.length === 0) return jmError("ไม่ได้ระบุรายการที่จะลบ", 400);

  await auditMutation(req, g.auth);
  const { error } = await admin
    .from("just_me_boq_items")
    .delete()
    .eq("org_id", g.orgId)
    .eq("boq_id", boqId)
    .in("id", ids);
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ ok: true, deleted: ids.length });
}

/** รับได้ทั้ง `{ items: [...] }` และบรรทัดเดียวใน body ตรง ๆ */
function readItems(body: Record<string, unknown>): BoqItemInput[] {
  if (Array.isArray(body.items)) return body.items as BoqItemInput[];
  if (typeof body.name === "string") return [body as unknown as BoqItemInput];
  return [];
}

/** id ทุกตัวที่บรรทัดอ้างถึงต้องอยู่ org เดียวกัน (FK เป็นคอลัมน์เดียว → DB ไม่ได้กันให้) */
async function checkRefs(orgId: string, inputs: BoqItemInput[]): Promise<string | null> {
  const categoryIds = new Set(inputs.map((i) => i.category_id).filter(Boolean));
  const itemIds = new Set(inputs.map((i) => i.item_id).filter(Boolean));
  const refs = [
    ...Array.from(categoryIds).map((value) => ({
      value,
      table: "just_me_work_categories",
      label: "หมวดงาน",
    })),
    ...Array.from(itemIds).map((value) => ({
      value,
      table: "just_me_inventory_items",
      label: "วัสดุในคลัง",
    })),
  ];
  return assertOrgRefs(orgId, refs);
}
