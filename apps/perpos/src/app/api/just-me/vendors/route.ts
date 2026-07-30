/**
 * /api/just-me/vendors — ทะเบียนผู้ขาย
 * GET   = สมาชิกทุกคน (ไม่มีข้อมูลต้นทุนในตารางนี้)
 * POST  = owner/manager · PATCH = owner/manager (`is_active:false` = เลิกใช้ ไม่ลบจริง)
 *
 * ⛔ route.ts export ได้เฉพาะ handler — ของใช้ร่วมอยู่ `../_lib.ts` (LESSONS 2026-07-29)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { auditMutation, guard, jmError, pickFields } from "../_lib";
import { countVendorWins, listVendors } from "@/lib/just-me/purchasing";

const EDITABLE = [
  "name",
  "tax_id",
  "phone",
  "email",
  "address",
  "contact_name",
  "note",
  "is_active",
] as const;

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;

  const sp = req.nextUrl.searchParams;
  try {
    const admin = createAdminClient();
    const [rows, wins] = await Promise.all([
      listVendors(admin, g.orgId, {
        includeInactive: sp.get("includeInactive") === "1",
        q: sp.get("q") ?? undefined,
      }),
      countVendorWins(admin, g.orgId),
    ]);
    return NextResponse.json({
      rows: rows.map((v) => ({ ...v, win_count: wins.get(v.id) ?? 0 })),
      total: rows.length,
      role: g.auth.role,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดทะเบียนผู้ขายไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, EDITABLE);
  const invalid = normalize(payload);
  if (invalid) return jmError(invalid, 400);
  if (!payload.name) return jmError("กรุณาระบุชื่อผู้ขาย", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await createAdminClient()
    .from("just_me_vendors")
    .insert({ ...payload, org_id: g.orgId, created_by: g.auth.userId })
    .select("*")
    .single();
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ vendor: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : req.nextUrl.searchParams.get("id");
  if (!id) return jmError("ไม่ได้ระบุผู้ขายที่จะแก้", 400);

  const payload = pickFields(body, EDITABLE);
  const invalid = normalize(payload);
  if (invalid) return jmError(invalid, 400);
  if ("name" in payload && !payload.name) return jmError("กรุณาระบุชื่อผู้ขาย", 400);
  if (Object.keys(payload).length === 0) return jmError("ไม่มีข้อมูลที่จะแก้ไข", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await createAdminClient()
    .from("just_me_vendors")
    .update(payload)
    .eq("org_id", g.orgId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return jmError(error.message, 500);
  if (!data) return jmError("ไม่พบผู้ขายรายนี้ในองค์กรนี้", 404);

  return NextResponse.json({ vendor: data });
}

/** ตัดช่องว่าง + กันค่าที่ไม่ใช่ boolean หลุดลง `is_active` */
function normalize(payload: Record<string, unknown>): string | null {
  for (const key of ["name", "tax_id", "phone", "email", "address", "contact_name", "note"]) {
    if (key in payload && typeof payload[key] === "string") {
      const trimmed = (payload[key] as string).trim();
      payload[key] = trimmed === "" ? null : trimmed;
    }
  }
  if ("is_active" in payload && typeof payload.is_active !== "boolean") {
    return "สถานะการใช้งานไม่ถูกต้อง";
  }
  return null;
}
