import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery } from "../../_lib";
import { getEmployee } from "@/lib/hrm/employees";
import { listDocuments } from "@/lib/hrm/documents";
import { listLeaveRequests } from "@/lib/hrm/leave";

const ROUTE = "/api/hrm/employees/[id]";

type Ctx = { params: Promise<{ id: string }> };

/** GET ?orgId= → แฟ้ม 360° พนักงาน (ข้อมูล + เอกสาร + ใบลา) */
export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const employee = await getEmployee(auth.rls, orgId, id);
    if (!employee) return hrmError("ไม่พบพนักงาน", 404);
    const [documents, leaveRequests] = await Promise.all([
      listDocuments(auth.rls, orgId, { employeeId: id }),
      listLeaveRequests(auth.rls, orgId, { employeeId: id }),
    ]);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ employee, documents, leaveRequests });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

/** DELETE ?orgId= → soft delete (status='terminated' + end_date วันนี้) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์ลบพนักงาน", 403);

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await admin
    .from("hrm_employees")
    .update({ status: "terminated", end_date: today })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
