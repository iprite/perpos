/**
 * GET /api/bi/metrics?orgId= → { metrics } (contract §6.4)
 *
 * เฉพาะ metric ที่ `verified` + อยู่ใน module scope ที่ org เปิด + role ของผู้ถามเห็นได้
 * (RBAC ระดับ metric — role ที่ไม่มีสิทธิ์ต้องไม่เห็นแม้ในรายการ "คำถามตัวอย่าง")
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { listVisibleMetrics } from "@/lib/bi/metrics";
import { resolveOrgScopes } from "@/lib/bi/resolver";
import { missingOrgId, readOrgId, requireBiMember } from "../_lib";

export async function GET(req: NextRequest) {
  const orgId = readOrgId(req);
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const scopes = await resolveOrgScopes(admin, auth.orgId);
    const metrics = await listVisibleMetrics({ admin, scopes, role: auth.role });
    return NextResponse.json({ metrics });
  } catch (e) {
    console.error("[api/bi/metrics]", (e as Error).message);
    return NextResponse.json({ error: "ดึงรายการตัวชี้วัดไม่สำเร็จ" }, { status: 500 });
  }
}
