/**
 * /api/just-me/projects — ทะเบียนโครงการ
 * GET  = สมาชิกทุกคน (viewer ได้ข้อมูลที่ถูกตัดคอลัมน์ต้นทุนออกแล้ว)
 * POST = owner/manager (`canWrite`)
 *
 * ⛔ route.ts export ได้เฉพาะ handler — ของใช้ร่วมอยู่ `../_lib.ts` (LESSONS 2026-07-29)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import {
  assertOrgMember,
  assertOrgRefs,
  auditMutation,
  guard,
  insertWithGeneratedCode,
  jmError,
  pickFields,
  stripCost,
  stripCostList,
  validateProjectNumbers,
} from "../_lib";
import { listProjects } from "@/lib/just-me/projects";
import type { ProjectStatus } from "@/lib/just-me/types";

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
] as const;

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.getAll("status").filter(Boolean) as ProjectStatus[];
  const yearRaw = Number(sp.get("year"));

  try {
    const page = await listProjects(createAdminClient(), g.orgId, {
      status: statusParam.length > 0 ? statusParam : undefined,
      managerId: sp.get("managerId") ?? undefined,
      q: sp.get("q") ?? undefined,
      year: Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : undefined,
      limit: Number(sp.get("limit")) || undefined,
      offset: Number(sp.get("offset")) || undefined,
    });
    return NextResponse.json({
      ...page,
      rows: stripCostList(page.rows as unknown as Record<string, unknown>[], g.auth.role),
      role: g.auth.role,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดรายการโครงการไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, EDITABLE);

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) return jmError("กรุณาระบุชื่อโครงการ", 400);
  payload.name = name;

  const numeric = validateProjectNumbers(payload);
  if (numeric) return jmError(numeric, 400);

  const refErr = await assertOrgRefs(g.orgId, [
    { value: payload.acc_contact_id, table: "acc_contacts", label: "ลูกค้า" },
  ]);
  if (refErr) return jmError(refErr, 400);
  const memberErr = await assertOrgMember(g.orgId, payload.manager_id, "ผู้จัดการโครงการ");
  if (memberErr) return jmError(memberErr, 400);

  await auditMutation(req, g.auth);
  const admin = createAdminClient();

  const created = await insertWithGeneratedCode<Record<string, unknown>>(
    { orgId: g.orgId, table: "just_me_projects", column: "project_code", prefix: "JM" },
    async (code) => {
      const { data, error } = await admin
        .from("just_me_projects")
        .insert({
          ...payload,
          org_id: g.orgId,
          project_code: code,
          status: "survey",
          created_by: g.auth.userId,
        })
        .select("*")
        .single();
      return { data: data as Record<string, unknown> | null, error };
    },
  );
  if (!created.ok) return jmError(created.error, created.status);

  return NextResponse.json({ project: stripCost(created.data, g.auth.role) }, { status: 201 });
}
