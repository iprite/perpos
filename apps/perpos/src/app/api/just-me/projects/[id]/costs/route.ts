/**
 * /api/just-me/projects/[id]/costs — ต้นทุนที่ไม่ผ่านคลัง (ค่าแรง/ผู้รับเหมาช่วง/ขนส่ง)
 * ทุก method = **cost-access** (owner/manager) — viewer เข้าไม่ได้เลย (contract §4.5 / §4.6)
 * ต้นทุนพวกนี้เข้าสูตร `actual_cost` ใน `project-metrics.ts`
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError, numOrNull } from "../../../_lib";
import { getProject, listProjectCosts } from "@/lib/just-me/projects";
import type { ProjectCostKind } from "@/lib/just-me/types";

type Ctx = { params: Promise<{ id: string }> };

const COST_KINDS = new Set<ProjectCostKind>(["labor", "subcontract", "transport", "other"]);

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  try {
    const costs = await listProjectCosts(admin, g.orgId, id);
    return NextResponse.json({ costs });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดต้นทุนไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();

  try {
    const project = await getProject(admin, g.orgId, id);
    if (!project) return jmError("ไม่พบโครงการนี้", 404);

    const kind = String(body.cost_kind ?? "other") as ProjectCostKind;
    if (!COST_KINDS.has(kind)) return jmError("ประเภทต้นทุนไม่ถูกต้อง", 400);

    const costDate = typeof body.cost_date === "string" ? body.cost_date.slice(0, 10) : "";
    if (!costDate) return jmError("กรุณาเลือกวันที่ของต้นทุน", 400);

    const amount = numOrNull(body.amount);
    if (amount === undefined || amount === null || !(amount > 0)) {
      return jmError("จำนวนเงินต้องมากกว่า 0", 400);
    }

    const refErr = await assertOrgRefs(g.orgId, [
      { value: body.vendor_id, table: "just_me_vendors", label: "ผู้ขาย" },
      { value: body.boq_item_id, table: "just_me_boq_items", label: "รายการใน BOQ" },
    ]);
    if (refErr) return jmError(refErr, 400);

    await auditMutation(req, g.auth);
    const { data, error } = await admin
      .from("just_me_project_costs")
      .insert({
        org_id: g.orgId,
        project_id: id,
        cost_kind: kind,
        cost_date: costDate,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        amount,
        vendor_id: (body.vendor_id as string) || null,
        boq_item_id: (body.boq_item_id as string) || null,
        file_path: (body.file_path as string) || null,
        recorded_by: g.auth.userId,
        created_by: g.auth.userId,
      })
      .select("*")
      .single();
    if (error) return jmError(error.message, 500);

    return NextResponse.json({ cost: data }, { status: 201 });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "บันทึกต้นทุนไม่สำเร็จ", 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const costId = req.nextUrl.searchParams.get("costId") ?? "";
  if (!costId) return jmError("ไม่ได้ระบุรายการที่จะลบ", 400);

  const admin = createAdminClient();
  await auditMutation(req, g.auth);
  const { error, count } = await admin
    .from("just_me_project_costs")
    .delete({ count: "exact" })
    .eq("org_id", g.orgId)
    .eq("project_id", id)
    .eq("id", costId);
  if (error) return jmError(error.message, 500);
  if (!count) return jmError("ไม่พบรายการต้นทุนนี้", 404);

  return NextResponse.json({ ok: true });
}
