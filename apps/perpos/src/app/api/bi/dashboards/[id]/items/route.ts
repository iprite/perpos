/**
 * POST /api/bi/dashboards/[id]/items → { item }   (ปักหมุดคำตอบเป็นการ์ด)
 *
 * ด่านตามลำดับ (ห้ามสลับ):
 *   1. `requireBiMember` + `canWriteBi`  → viewer ปักหมุดไม่ได้
 *   2. ownership ของแดชบอร์ด (ใน `pinItem`) → ไม่ใช่เจ้าของ = 404
 *   3. **`metricKey` ต้องเป็น metric ที่ role นี้เห็นได้จริง** — กันปักหมุดตัวชี้วัดนอกสิทธิ์
 *      แล้วค่อยไปโดนปฏิเสธตอนรัน (ชื่อการ์ด/การมีอยู่ของ metric ก็เป็นการรั่วข้อมูล)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { setAuditContext } from "@/app/api/_lib/audit";
import { BiDashboardLimitError, pinItem } from "@/lib/bi/dashboards";
import { loadRunMetric } from "@/lib/bi/run";
import { resolveOrgScopes } from "@/lib/bi/resolver";
import type { BiMetricParams } from "@/lib/bi/types";
import { biForbiddenWrite, canWriteBi, missingOrgId, requireBiMember } from "../../../_lib";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let body: {
    orgId?: string;
    metricKey?: string;
    params?: BiMetricParams | null;
    chartType?: string | null;
    title?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const orgId = (body.orgId ?? "").trim();
  if (!orgId) return missingOrgId();

  const metricKey = (body.metricKey ?? "").trim();
  if (!metricKey) {
    return NextResponse.json({ error: "ต้องระบุตัวชี้วัดที่ต้องการปักหมุด" }, { status: 400 });
  }

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBi(auth.role)) return biForbiddenWrite();

  await setAuditContext(req, auth.userId, auth.orgId);

  const { id } = await ctx.params;
  try {
    const admin = createAdminClient();

    const scopes = await resolveOrgScopes(admin, auth.orgId);
    const metric = await loadRunMetric({ admin, metricKey, role: auth.role, scopes });
    if (!metric) {
      return NextResponse.json(
        { error: "ตัวชี้วัดนี้ยังใช้งานไม่ได้ หรือบทบาทของคุณไม่มีสิทธิ์ดู" },
        { status: 403 },
      );
    }

    const item = await pinItem(admin, {
      orgId: auth.orgId,
      dashboardId: id,
      profileId: auth.userId,
      metricKey,
      params: body.params ?? {},
      chartType: body.chartType ?? null,
      title: body.title ?? null,
    });
    if (!item) return NextResponse.json({ error: "ไม่พบแดชบอร์ดนี้" }, { status: 404 });

    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    if (e instanceof BiDashboardLimitError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[api/bi/dashboards/[id]/items POST]", (e as Error).message);
    return NextResponse.json({ error: "ปักหมุดการ์ดไม่สำเร็จ" }, { status: 500 });
  }
}
