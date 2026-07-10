// POST /api/gov-procure/ai/brief?orgId=... — AI-1 Executive Brief (§5b)
// rule (computeSummary) คำนวณ KPI ก่อน → AI narrate. read-only (ไม่ mutation → ไม่ setAuditContext).
// AI ล่ม → fallback ตัวเลข rule ล้วน (ไม่ throw / ไม่ 500). log token ใน buildExecutiveBrief.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireGovProcureMember, orgIdFromQuery, govError } from "../../_lib";
import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { computeSummary } from "@/lib/gov-procure/summary";
import { buildExecutiveBrief } from "@/lib/gov-procure/ai";

export const maxDuration = 30; // เผื่อ latency Gemini (narration สั้น ~3-5 วิ)

export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  // gate: member ของ module (viewer อ่านได้ — brief เป็น read-only insight)
  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const [orders, settings] = await Promise.all([
      listOrders(admin, orgId),
      getSettings(admin, orgId),
    ]);
    const summary = computeSummary(orders, settings.sla_threshold);
    const brief = await buildExecutiveBrief(summary);
    return NextResponse.json({ brief });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
