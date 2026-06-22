/**
 * GET /api/admin/orgs/[id] — ข้อมูลรวม 1 องค์กร สำหรับ Org 360° Drawer (super admin)
 * Logic จริงอยู่ใน lib/admin/org-detail.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { computeOrgDetail } from "@/lib/admin/org-detail";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  const detail = await computeOrgDetail(createAdminClient(), id);
  if (!detail) return NextResponse.json({ error: "ไม่พบองค์กร" }, { status: 404 });

  return NextResponse.json({ detail });
}
