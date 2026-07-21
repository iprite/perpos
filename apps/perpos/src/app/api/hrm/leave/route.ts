import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery, employeeInOrg } from "../_lib";
import { listLeaveRequests, listLeaveTypes, computeBalances } from "@/lib/hrm/leave";
import type { LeaveStatus } from "@/lib/hrm/types";

const ROUTE = "/api/hrm/leave";

/** GET ?orgId=[&view=requests|types|balances&status=&year=] */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  const view = p.get("view") ?? "requests";
  try {
    if (view === "types") {
      const types = await listLeaveTypes(auth.rls, orgId);
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
      return NextResponse.json({ leaveTypes: types });
    }
    if (view === "balances") {
      const year = Number(p.get("year")) || new Date().getFullYear();
      const balances = await computeBalances(auth.rls, orgId, year);
      void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
      return NextResponse.json({ balances });
    }
    const requests = await listLeaveRequests(auth.rls, orgId, {
      status: (p.get("status") as LeaveStatus) || undefined,
      employeeId: p.get("employeeId") ?? undefined,
      year: p.get("year") ? Number(p.get("year")) : undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ requests });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

/** POST → ยื่นใบลา (status='pending') */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์ยื่นใบลา", 403);

  const employee_id = String(body.employee_id ?? "");
  const leave_type_id = String(body.leave_type_id ?? "");
  const start_date = String(body.start_date ?? "");
  const end_date = String(body.end_date ?? "");
  const days = Number(body.days);
  if (!employee_id || !leave_type_id || !start_date || !end_date || !days || days <= 0) {
    return hrmError("กรุณากรอกพนักงาน ประเภทการลา วันที่ และจำนวนวันให้ครบ");
  }

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  if (!(await employeeInOrg(admin, orgId, employee_id))) {
    return hrmError("ไม่พบพนักงานในองค์กรนี้", 404);
  }
  const { data, error } = await admin
    .from("hrm_leave_requests")
    .insert({
      org_id: orgId,
      employee_id,
      leave_type_id,
      start_date,
      end_date,
      days,
      reason: (body.reason as string) || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
