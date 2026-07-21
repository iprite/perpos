import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery } from "../../_lib";
import type { LeaveStatus } from "@/lib/hrm/types";

const ROUTE = "/api/hrm/leave/[id]";

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: [],
  cancelled: [],
};

/** PATCH → อนุมัติ/ปฏิเสธ/ยกเลิกใบลา (body: orgId, status). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const nextStatus = String(body.status ?? "") as LeaveStatus;
  if (!orgId) return hrmError("missing orgId");
  if (!["approved", "rejected", "cancelled"].includes(nextStatus)) {
    return hrmError("สถานะไม่ถูกต้อง");
  }

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์อนุมัติ/ปฏิเสธใบลา", 403);

  const admin = createAdminClient();
  const { data: current, error: curErr } = await admin
    .from("hrm_leave_requests")
    .select("status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (curErr) return hrmError(curErr.message, 500);
  if (!current) return hrmError("ไม่พบใบลา", 404);

  const curStatus = (current as { status: LeaveStatus }).status;
  if (!ALLOWED_TRANSITIONS[curStatus]?.includes(nextStatus)) {
    return hrmError(`ไม่สามารถเปลี่ยนสถานะจาก "${curStatus}" เป็น "${nextStatus}" ได้`, 409);
  }

  await setAuditContext(req, auth.userId, orgId);
  const patch: Record<string, unknown> = {
    status: nextStatus,
    decided_at: new Date().toISOString(),
    approved_by: nextStatus === "approved" ? auth.userId : null,
  };

  const { data, error } = await admin
    .from("hrm_leave_requests")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
