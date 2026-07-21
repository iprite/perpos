/**
 * GET /api/acc-firm/eligible-clients?orgId=<firmOrgId>
 *   — รายชื่อ org ที่ "เปิด module accounting" ไว้ = candidate ที่จะเป็น client ของสำนักงานบัญชี
 *     (acc-firm รับทำบัญชีให้ → client ต้องมี accounting เปิด ถึงจะเชื่อมงานได้)
 *
 * super_admin เท่านั้น (เพิ่ม client engagement = super_admin — SEC-1) · service-role
 * เพื่ออ่าน org_module_settings ข้าม org (firm member ไม่ได้เป็นสมาชิก org ลูกค้า).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");

  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 1. org ที่เปิด accounting
  const { data: enabled, error: e1 } = await admin
    .from("org_module_settings")
    .select("organization_id")
    .eq("module_key", "accounting")
    .eq("is_enabled", true);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const ids = Array.from(new Set((enabled ?? []).map((r) => r.organization_id as string))).filter(
    (id) => id !== firmOrgId,
  ); // ตัด firm ตัวเองออก
  if (ids.length === 0) return NextResponse.json({ orgs: [] });

  // 2. ดึงชื่อ org
  const { data: orgs, error: e2 } = await admin
    .from("organizations")
    .select("id, name")
    .in("id", ids)
    .order("name");
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ orgs: orgs ?? [] });
}
