/**
 * /api/just-me/work-categories — หมวดงาน (+ margin ชั้นหมวด)
 * ทุก method ต้องมี cost-access (มี `default_margin_pct` = ข้อมูลกำไร)
 * GET / POST / PATCH — ไม่มี DELETE (ปิดใช้งานผ่าน `is_active` แทน เพื่อไม่ให้ BOQ เก่าเสียประวัติ)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { auditMutation, guard, jmError, numOrNull, pickFields } from "../_lib";
import { listWorkCategories } from "@/lib/just-me/price-book";

const EDITABLE = ["code", "name", "default_margin_pct", "sort_order", "is_active"] as const;

export async function GET(req: NextRequest) {
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  try {
    const rows = await listWorkCategories(createAdminClient(), g.orgId, {
      includeInactive: req.nextUrl.searchParams.get("includeInactive") === "1",
    });
    return NextResponse.json({ categories: rows, total: rows.length });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดหมวดงานไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, EDITABLE);
  const invalid = normalize(payload);
  if (invalid) return jmError(invalid, 400);
  if (!payload.name) return jmError("กรุณาระบุชื่อหมวดงาน", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await createAdminClient()
    .from("just_me_work_categories")
    .insert({ ...payload, org_id: g.orgId, created_by: g.auth.userId })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return jmError("รหัสหมวดงานนี้ถูกใช้ไปแล้ว", 409);
    return jmError(error.message, 500);
  }
  return NextResponse.json({ category: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : req.nextUrl.searchParams.get("id");
  if (!id) return jmError("ไม่ได้ระบุหมวดงานที่จะแก้", 400);

  const payload = pickFields(body, EDITABLE);
  const invalid = normalize(payload);
  if (invalid) return jmError(invalid, 400);
  if ("name" in payload && !payload.name) return jmError("กรุณาระบุชื่อหมวดงาน", 400);
  if (Object.keys(payload).length === 0) return jmError("ไม่มีข้อมูลที่จะแก้ไข", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await createAdminClient()
    .from("just_me_work_categories")
    .update(payload)
    .eq("org_id", g.orgId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return jmError("รหัสหมวดงานนี้ถูกใช้ไปแล้ว", 409);
    return jmError(error.message, 500);
  }
  if (!data) return jmError("ไม่พบหมวดงานนี้", 404);
  return NextResponse.json({ category: data });
}

function normalize(payload: Record<string, unknown>): string | null {
  if (typeof payload.name === "string") payload.name = payload.name.trim();
  if (typeof payload.code === "string") payload.code = payload.code.trim() || null;
  if ("default_margin_pct" in payload) {
    const v = numOrNull(payload.default_margin_pct);
    if (v === undefined) return "ค่า %กำไร ไม่ถูกต้อง";
    payload.default_margin_pct = v;
  }
  if ("sort_order" in payload) {
    const v = numOrNull(payload.sort_order);
    if (v === undefined) return "ลำดับการแสดงผลไม่ถูกต้อง";
    payload.sort_order = v ?? 0;
  }
  return null;
}
