/**
 * GET    /api/bi/dashboards/[id]?orgId= → { dashboard, items }
 * PATCH  /api/bi/dashboards/[id]        → { dashboard }   (เปลี่ยนชื่อ)
 * DELETE /api/bi/dashboards/[id]        → { ok: true }    (การ์ดลบตาม FK CASCADE)
 *
 * ไม่ใช่เจ้าของ = **404 เท่ากับ "ไม่มี"** (ห้าม 403 ที่ยืนยันว่ามีอยู่จริง — กฎเดียวกับ thread)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { setAuditContext } from "@/app/api/_lib/audit";
import {
  BiDashboardLimitError,
  deleteDashboard,
  getDashboard,
  renameDashboard,
} from "@/lib/bi/dashboards";
import { biForbiddenWrite, canWriteBi, missingOrgId, readOrgId, requireBiMember } from "../../_lib";

const NOT_FOUND = { error: "ไม่พบแดชบอร์ดนี้" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const orgId = readOrgId(req);
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  try {
    const result = await getDashboard(createAdminClient(), auth.orgId, id, auth.userId);
    if (!result) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/bi/dashboards/[id] GET]", (e as Error).message);
    return NextResponse.json({ error: "ดึงแดชบอร์ดไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let body: { orgId?: string; name?: string };
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

  const { id } = await ctx.params;
  try {
    const dashboard = await renameDashboard(
      createAdminClient(),
      auth.orgId,
      id,
      auth.userId,
      body.name ?? "",
    );
    if (!dashboard) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ dashboard });
  } catch (e) {
    if (e instanceof BiDashboardLimitError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[api/bi/dashboards/[id] PATCH]", (e as Error).message);
    return NextResponse.json({ error: "เปลี่ยนชื่อแดชบอร์ดไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let body: { orgId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const orgId = (body.orgId ?? readOrgId(req) ?? "").trim();
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBi(auth.role)) return biForbiddenWrite();

  await setAuditContext(req, auth.userId, auth.orgId);

  const { id } = await ctx.params;
  try {
    const ok = await deleteDashboard(createAdminClient(), auth.orgId, id, auth.userId);
    if (!ok) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/bi/dashboards/[id] DELETE]", (e as Error).message);
    return NextResponse.json({ error: "ลบแดชบอร์ดไม่สำเร็จ" }, { status: 500 });
  }
}
