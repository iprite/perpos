/**
 * GET /api/tmc/dashboard — ภาพรวมธุรกิจ TMC (TMC member / super admin)
 * Logic จริงอยู่ใน lib/tmc/dashboard.ts (ใช้ร่วมกับ server component หน้า /[orgSlug]/tmc)
 * route นี้คงไว้เผื่อ caller อื่น (mobile ฯลฯ)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTmcMember } from "../_lib";
import { recordMetric } from "@/lib/metrics";
import { computeTmcDashboard } from "@/lib/tmc/dashboard";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const orgId = p.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const from = p.get("from") ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = p.get("to") ?? new Date().toISOString().slice(0, 10);

  const data = await computeTmcDashboard(auth.rls, orgId, { from, to });
  void recordMetric({ orgId, route: "/api/tmc/dashboard", method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
