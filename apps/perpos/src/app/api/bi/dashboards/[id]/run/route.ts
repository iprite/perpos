/**
 * POST /api/bi/dashboards/[id]/run → { results: BiCardResult[] }
 *
 * รันทุกการ์ดของแดชบอร์ดใน **คำขอเดียว** (Promise.all + CARD_CONCURRENCY)
 *  - ownership ก่อนเสมอ (ไม่ใช่เจ้าของ = 404) **ก่อนนับโควตา**
 *  - นับ `incr_bi_dashboard_usage` **1 ครั้งต่อคำขอ ไม่ใช่ต่อการ์ด**
 *  - **ห้ามเรียก `incr_bi_usage`** — โควตาคำถาม AI ต้องไม่ขยับเพราะการเปิดแดชบอร์ด (R6)
 *  - `role` ที่ส่งเข้า RPC = role ของ **คนที่กำลังดู** ไม่ใช่คนที่ปักหมุด
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { getDashboard } from "@/lib/bi/dashboards";
import { incrDashboardUsage, runCards } from "@/lib/bi/run";
import { resolveOrgScopes } from "@/lib/bi/resolver";
import { missingOrgId, readOrgId, requireBiMember } from "../../../_lib";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const { id } = await ctx.params;
  try {
    const admin = createAdminClient();

    // ownership ก่อนโควตา — คำขอที่ไม่ชอบธรรมไม่ควรกินโควตาของเจ้าตัว
    const dashboard = await getDashboard(admin, auth.orgId, id, auth.userId);
    if (!dashboard) return NextResponse.json({ error: "ไม่พบแดชบอร์ดนี้" }, { status: 404 });

    const allowed = await incrDashboardUsage(admin, auth.orgId, auth.userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "เปิดแดชบอร์ดครบเพดานของวันนี้แล้ว กรุณาลองใหม่พรุ่งนี้" },
        { status: 429 },
      );
    }

    const scopes = await resolveOrgScopes(admin, auth.orgId);
    const results = await runCards({
      admin,
      orgId: auth.orgId,
      profileId: auth.userId,
      role: auth.role,
      items: dashboard.items,
      scopes,
    });

    return NextResponse.json({ results });
  } catch (e) {
    console.error("[api/bi/dashboards/[id]/run POST]", (e as Error).message);
    return NextResponse.json({ error: "แสดงข้อมูลแดชบอร์ดไม่สำเร็จ" }, { status: 500 });
  }
}
