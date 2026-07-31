/**
 * /api/just-me/projects/[id]/progress — บันทึกความคืบหน้าหน้างาน
 * GET = สมาชิก · POST = owner/manager (ไม่ใช่ข้อมูลต้นทุน → viewer อ่านได้)
 *
 * ⛔ ใช้ `done_qty` เป็นหลัก (`percent` ใช้เมื่อวัดเป็นปริมาณไม่ได้) — DB บังคับว่าต้องมีอย่างน้อยหนึ่งช่อง
 *    "ยังไม่บันทึก" ต้องไม่มีแถว (ห้ามบันทึกแถวว่างแล้วให้ UI ตีเป็น 0% — contract §8)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError, numOrNull } from "../../../_lib";
import { getProject, listProjectProgress } from "@/lib/just-me/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  try {
    const progress = await listProjectProgress(admin, g.orgId, id);
    return NextResponse.json({ progress });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดความคืบหน้าไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();

  try {
    const project = await getProject(admin, g.orgId, id);
    if (!project) return jmError("ไม่พบโครงการนี้", 404);

    const progressDate =
      typeof body.progress_date === "string" && body.progress_date
        ? body.progress_date.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const doneQty = numOrNull(body.done_qty);
    const percent = numOrNull(body.percent);
    if (doneQty === undefined || percent === undefined) {
      return jmError("ตัวเลขที่กรอกไม่ถูกต้อง", 400);
    }
    if ((doneQty ?? null) === null && (percent ?? null) === null) {
      return jmError("กรุณาระบุปริมาณงานที่ทำเสร็จ หรือ % ความคืบหน้า", 400);
    }
    if (doneQty !== null && doneQty < 0) return jmError("ปริมาณงานที่ทำเสร็จติดลบไม่ได้", 400);
    if (percent !== null && (percent < 0 || percent > 100)) {
      return jmError("% ความคืบหน้าต้องอยู่ระหว่าง 0–100", 400);
    }

    const refErr = await assertOrgRefs(g.orgId, [
      { value: body.boq_item_id, table: "just_me_boq_items", label: "รายการใน BOQ" },
    ]);
    if (refErr) return jmError(refErr, 400);

    await auditMutation(req, g.auth);
    const { data, error } = await admin
      .from("just_me_project_progress")
      .insert({
        org_id: g.orgId,
        project_id: id,
        boq_item_id: (body.boq_item_id as string) || null,
        progress_date: progressDate,
        done_qty: doneQty,
        percent,
        note: typeof body.note === "string" ? body.note.trim() || null : null,
        recorded_by: g.auth.userId,
        created_by: g.auth.userId,
      })
      .select("*")
      .single();
    if (error) return jmError(error.message, 500);

    // เริ่มบันทึกความคืบหน้า = งานเดินแล้ว → ขยับสถานะให้อัตโนมัติ (ครั้งแรกเท่านั้น)
    if (project.status === "won") {
      await admin
        .from("just_me_projects")
        .update({ status: "in_progress" })
        .eq("org_id", g.orgId)
        .eq("id", id)
        .eq("status", "won");
    }

    return NextResponse.json({ progress: data }, { status: 201 });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "บันทึกความคืบหน้าไม่สำเร็จ", 500);
  }
}
