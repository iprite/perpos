/**
 * GET /api/admin/health — คะแนนสุขภาพต่อ org (super admin)
 * Logic จริงอยู่ใน lib/admin/health.ts (ใช้ร่วมกับ server component หน้า /admin/health)
 * route นี้คงไว้ให้ client view poll ทุก 60 วิ
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { computeOrgHealth } from "@/lib/admin/health";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const orgs = await computeOrgHealth(createAdminClient());
  return NextResponse.json({ orgs });
}
