/**
 * /api/just-me/projects/[id] — รายละเอียด / แก้ไข / ยกเลิกโครงการ
 * GET    = สมาชิก (viewer ถูกตัดคอลัมน์ต้นทุน)
 * PATCH  = owner/manager · เปลี่ยนสถานะผ่าน `status` ได้ (ตรวจค่าตาม enum)
 * DELETE = owner เท่านั้น — **ยกเลิกแบบนุ่ม** (status = `cancelled`) ไม่ลบข้อมูลจริง
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import {
  assertOrgMember,
  assertOrgRefs,
  auditMutation,
  guard,
  jmError,
  pickFields,
  stripCost,
  validateProjectNumbers,
} from "../../_lib";
import { getProject, listProjectFiles } from "@/lib/just-me/projects";
import { listBoqs } from "@/lib/just-me/boq";
import type { ProjectStatus } from "@/lib/just-me/types";

type Ctx = { params: Promise<{ id: string }> };

const PROJECT_STATUSES: ProjectStatus[] = [
  "survey",
  "boq",
  "quoted",
  "won",
  "in_progress",
  "completed",
  "closed",
  "lost",
  "cancelled",
];

const EDITABLE = [
  "name",
  "customer_name",
  "acc_contact_id",
  "site_address",
  "latitude",
  "longitude",
  "manager_id",
  "start_date",
  "end_date",
  "contract_amount",
  "margin_pct",
  "retention_pct",
  "note",
  "status",
] as const;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  try {
    const project = await getProject(admin, g.orgId, id);
    if (!project) return jmError("ไม่พบโครงการนี้", 404);

    const [files, boqs] = await Promise.all([
      listProjectFiles(admin, g.orgId, id),
      listBoqs(admin, g.orgId, id),
    ]);

    return NextResponse.json({
      project: stripCost(project as unknown as Record<string, unknown>, g.auth.role),
      files,
      boqs: boqs.map((b) => stripCost(b as unknown as Record<string, unknown>, g.auth.role)),
      role: g.auth.role,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดข้อมูลโครงการไม่สำเร็จ", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const existing = await getProject(admin, g.orgId, id);
  if (!existing) return jmError("ไม่พบโครงการนี้", 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, EDITABLE);

  if ("name" in payload) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) return jmError("กรุณาระบุชื่อโครงการ", 400);
    payload.name = name;
  }
  if ("status" in payload) {
    if (!PROJECT_STATUSES.includes(payload.status as ProjectStatus)) {
      return jmError("สถานะโครงการไม่ถูกต้อง", 400);
    }
  }
  // งบต้นทุนเขียนได้จากการอนุมัติ BOQ เท่านั้น (baseline) — กันแก้มือให้ตัวเลขหลุดจากบรรทัดจริง
  if ("budget_cost" in body || "budget_revised_at" in body) {
    return jmError("งบต้นทุนแก้มือไม่ได้ — ระบบเขียนให้ตอนอนุมัติ BOQ", 400);
  }

  const numeric = validateProjectNumbers(payload);
  if (numeric) return jmError(numeric, 400);

  const refErr = await assertOrgRefs(g.orgId, [
    { value: payload.acc_contact_id, table: "acc_contacts", label: "ลูกค้า" },
  ]);
  if (refErr) return jmError(refErr, 400);
  const memberErr = await assertOrgMember(g.orgId, payload.manager_id, "ผู้จัดการโครงการ");
  if (memberErr) return jmError(memberErr, 400);

  if (Object.keys(payload).length === 0) return jmError("ไม่มีข้อมูลที่จะแก้ไข", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await admin
    .from("just_me_projects")
    .update(payload)
    .eq("id", id)
    .eq("org_id", g.orgId)
    .select("*")
    .single();
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ project: stripCost(data as Record<string, unknown>, g.auth.role) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { owner: true, write: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const existing = await getProject(admin, g.orgId, id);
  if (!existing) return jmError("ไม่พบโครงการนี้", 404);
  if (existing.status === "cancelled") {
    return NextResponse.json({
      project: stripCost(existing as unknown as Record<string, unknown>, g.auth.role),
    });
  }

  await auditMutation(req, g.auth);
  const { data, error } = await admin
    .from("just_me_projects")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", g.orgId)
    .select("*")
    .single();
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ project: stripCost(data as Record<string, unknown>, g.auth.role) });
}
