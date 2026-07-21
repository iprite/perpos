import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canClosePeriod, accError } from "../../../_lib";

const ROUTE = "/api/accounting/periods/[id]/close";
type Ctx = { params: Promise<{ id: string }> };

/** POST → ปิดงวด (accountant). draft journal ในงวดเตือน (ไม่บังคับ post). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canClosePeriod(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่ปิดงวดได้", 403);

  const admin = createAdminClient();
  const { data: period } = await admin
    .from("acc_periods")
    .select("status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!period) return accError("ไม่พบงวดบัญชี", 404);
  if ((period as { status: string }).status === "closed") return accError("งวดนี้ปิดแล้ว", 409);

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_periods")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: auth.userId })
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
