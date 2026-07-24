/**
 * GET /api/bi/threads/[id]?orgId= → { thread, messages }
 *
 * บทสนทนาเป็นของส่วนตัวรายคน — ต้องส่ง `auth.userId` เข้า `getThread` เสมอ
 * (ตาราง `bi_*` อ่านผ่าน service-role → RLS `created_by = auth.uid()` ไม่ทำงาน)
 * ไม่ใช่เจ้าของ = 404 เท่ากับ "ไม่มี" (ห้าม 403 ที่ยืนยันว่ามีอยู่จริง)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { getThread } from "@/lib/bi/threads";
import { missingOrgId, readOrgId, requireBiMember } from "../../_lib";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const orgId = readOrgId(req);
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;

  try {
    const result = await getThread(createAdminClient(), auth.orgId, id, auth.userId);
    if (!result) return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/bi/threads/[id] GET]", (e as Error).message);
    return NextResponse.json({ error: "ดึงบทสนทนาไม่สำเร็จ" }, { status: 500 });
  }
}
