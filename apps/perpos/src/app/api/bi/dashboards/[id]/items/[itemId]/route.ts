/**
 * PATCH  /api/bi/dashboards/[id]/items/[itemId] → { item }
 *   payload หนึ่งในสามแบบ: `{title}` · `{params, chartType?}` · `{direction:'up'|'down'}`
 * DELETE /api/bi/dashboards/[id]/items/[itemId] → { ok: true }
 *
 * ownership ของแดชบอร์ดถูกตรวจใน `lib/bi/dashboards.ts` ก่อนแตะ item ทุกครั้ง
 * ไม่ใช่เจ้าของ / ไม่มีการ์ดนี้ = 404 เหมือนกัน
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { setAuditContext } from "@/app/api/_lib/audit";
import { deleteItem, moveItem, updateItem } from "@/lib/bi/dashboards";
import { isMoveDirection, type BiMetricParams } from "@/lib/bi/types";
import {
  biForbiddenWrite,
  canWriteBi,
  missingOrgId,
  readOrgId,
  requireBiMember,
} from "../../../../_lib";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const NOT_FOUND = { error: "ไม่พบการ์ดนี้" };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  let body: {
    orgId?: string;
    title?: string | null;
    params?: BiMetricParams | null;
    chartType?: string | null;
    direction?: string;
  };
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

  const { id, itemId } = await ctx.params;
  try {
    const admin = createAdminClient();

    if (body.direction !== undefined) {
      if (!isMoveDirection(body.direction)) {
        return NextResponse.json({ error: "ทิศทางการย้ายไม่ถูกต้อง" }, { status: 400 });
      }
      const moved = await moveItem(admin, auth.orgId, id, itemId, auth.userId, body.direction);
      if (!moved) return NextResponse.json(NOT_FOUND, { status: 404 });
      return NextResponse.json({ item: moved });
    }

    const item = await updateItem(admin, auth.orgId, id, itemId, auth.userId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.params !== undefined ? { params: body.params } : {}),
      ...(body.chartType !== undefined ? { chartType: body.chartType } : {}),
    });
    if (!item) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("[api/bi/dashboards/[id]/items/[itemId] PATCH]", (e as Error).message);
    return NextResponse.json({ error: "แก้ไขการ์ดไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
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

  const { id, itemId } = await ctx.params;
  try {
    const ok = await deleteItem(createAdminClient(), auth.orgId, id, itemId, auth.userId);
    if (!ok) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/bi/dashboards/[id]/items/[itemId] DELETE]", (e as Error).message);
    return NextResponse.json({ error: "ลบการ์ดไม่สำเร็จ" }, { status: 500 });
  }
}
