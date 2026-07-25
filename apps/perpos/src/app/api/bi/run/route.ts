/**
 * POST /api/bi/run → BiDirectResult
 *
 * ใช้ 2 กรณี: (ก) เปลี่ยนช่วงเวลา/ฟิลเตอร์บนการ์ดใบเดียว (ข) drill-down คลิก datapoint
 * — **ไม่มี AI · ไม่แตะ thread/`bi_messages` · ไม่เรียก `incr_bi_usage`**
 * นับโควตาเดียวกับการ์ด (`incr_bi_dashboard_usage`) 1 ครั้งต่อคำขอ
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { BiRunError, incrDashboardUsage, runDirect } from "@/lib/bi/run";
import { classifyRunError } from "@/lib/bi/runner";
import type { BiMetricParams } from "@/lib/bi/types";
import { missingOrgId, requireBiMember } from "../_lib";

export async function POST(req: NextRequest) {
  let body: {
    orgId?: string;
    metricKey?: string;
    params?: BiMetricParams | null;
    chartType?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const orgId = (body.orgId ?? "").trim();
  if (!orgId) return missingOrgId();

  const metricKey = (body.metricKey ?? "").trim();
  if (!metricKey) return NextResponse.json({ error: "ต้องระบุตัวชี้วัด" }, { status: 400 });

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();

    const allowed = await incrDashboardUsage(admin, auth.orgId, auth.userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "ดูข้อมูลครบเพดานของวันนี้แล้ว กรุณาลองใหม่พรุ่งนี้" },
        { status: 429 },
      );
    }

    const result = await runDirect({
      admin,
      orgId: auth.orgId,
      profileId: auth.userId,
      role: auth.role,
      metricKey,
      params: body.params ?? {},
      chartType: body.chartType ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof BiRunError) {
      // ข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง — ห้ามปล่อย error ดิบ/ชื่อคอลัมน์ออกหน้าจอ
      return NextResponse.json(
        { error: e.userMessage, state: e.state },
        { status: e.state === "forbidden" ? 403 : 400 },
      );
    }
    const classified = classifyRunError((e as Error).message);
    console.error("[api/bi/run POST]", (e as Error).message);
    return NextResponse.json({ error: classified.text }, { status: 500 });
  }
}
