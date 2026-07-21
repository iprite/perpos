import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { requireGovProcureMember, orgIdFromQuery, govError } from "../_lib";
import { listOrders } from "@/lib/gov-procure/orders";
import { getSettings } from "@/lib/gov-procure/settings";
import { computeSummary } from "@/lib/gov-procure/summary";

// GET /api/gov-procure/summary?orgId=... → KPI aggregate (คำนวณฝั่ง server, rule ล้วน)
export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const [orders, settings] = await Promise.all([
      listOrders(admin, orgId),
      getSettings(admin, orgId),
    ]);
    const summary = computeSummary(orders, settings.sla_threshold);
    return NextResponse.json({ summary });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
