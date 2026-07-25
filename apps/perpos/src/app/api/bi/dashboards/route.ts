/**
 * GET  /api/bi/dashboards?orgId= → { dashboards }  (เฉพาะของผู้เรียก)
 * POST /api/bi/dashboards        → { dashboard }
 *   - มี `name` = สร้างใบใหม่ · ไม่มี `name` = คืน/สร้าง "แดชบอร์ดของฉัน" (ปักหมุดครั้งแรก)
 *
 * แดชบอร์ดเป็นของส่วนตัวรายคน → ส่ง `auth.userId` เข้าทุกฟังก์ชันเสมอ
 * (ตาราง `bi_*` วิ่งผ่าน service-role → RLS ไม่ทำงาน · ด่านจริงคือ `lib/bi/dashboards.ts`)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { setAuditContext } from "@/app/api/_lib/audit";
import {
  BiDashboardLimitError,
  createDashboard,
  ensureDefaultDashboard,
  listDashboards,
} from "@/lib/bi/dashboards";
import { biForbiddenWrite, canWriteBi, missingOrgId, readOrgId, requireBiMember } from "../_lib";

export async function GET(req: NextRequest) {
  const orgId = readOrgId(req);
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const dashboards = await listDashboards(createAdminClient(), auth.orgId, auth.userId);
    return NextResponse.json({ dashboards });
  } catch (e) {
    console.error("[api/bi/dashboards GET]", (e as Error).message);
    return NextResponse.json({ error: "ดึงรายการแดชบอร์ดไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { orgId?: string; name?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const orgId = (body.orgId ?? "").trim();
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBi(auth.role)) return biForbiddenWrite();

  await setAuditContext(req, auth.userId, auth.orgId);

  const name = (body.name ?? "").trim();
  try {
    const admin = createAdminClient();
    const dashboard = name
      ? await createDashboard(admin, { orgId: auth.orgId, profileId: auth.userId, name })
      : await ensureDefaultDashboard(admin, auth.orgId, auth.userId);
    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (e) {
    if (e instanceof BiDashboardLimitError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[api/bi/dashboards POST]", (e as Error).message);
    return NextResponse.json({ error: "สร้างแดชบอร์ดไม่สำเร็จ" }, { status: 500 });
  }
}
