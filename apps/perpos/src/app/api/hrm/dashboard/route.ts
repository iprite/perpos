import { NextRequest, NextResponse } from "next/server";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, hrmError, orgIdFromQuery } from "../_lib";
import { getHrmDashboard } from "@/lib/hrm/dashboard";

const ROUTE = "/api/hrm/dashboard";

/** GET ?orgId= → KPI ภาพรวม HR (RLS). reuse กับ SSR page */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const data = await getHrmDashboard(auth.rls, orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json(data);
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}
