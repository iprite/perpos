import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery, employeeInOrg } from "../_lib";
import { listAttendance } from "@/lib/hrm/time";
import type { AttendanceStatus } from "@/lib/hrm/types";

const ROUTE = "/api/hrm/time";

/** GET ?orgId=&year=&month=[&employeeId=] → attendance ของเดือน */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  const year = Number(p.get("year")) || new Date().getFullYear();
  const month = Number(p.get("month")) || new Date().getMonth() + 1;
  try {
    const rows = await listAttendance(auth.rls, orgId, {
      employeeId: p.get("employeeId") ?? undefined,
      year,
      month,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ attendance: rows });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

const VALID_STATUS: AttendanceStatus[] = ["present", "absent", "leave", "holiday"];

/**
 * POST → upsert บันทึกเวลา 1 วัน (ใช้ unique(org_id,employee_id,work_date)).
 * body: { orgId, employee_id, work_date, status, check_in?, check_out?, is_late?, ot_hours?, note? }
 * PATCH = alias ของ upsert (แก้รายวัน).
 */
async function upsert(req: NextRequest, t0: number) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์บันทึกเวลา", 403);

  const employee_id = String(body.employee_id ?? "");
  const work_date = String(body.work_date ?? "");
  const status = String(body.status ?? "") as AttendanceStatus;
  if (!employee_id || !work_date) return hrmError("ระบุพนักงานและวันที่");
  if (!VALID_STATUS.includes(status)) return hrmError("สถานะเวลาทำงานไม่ถูกต้อง");

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  if (!(await employeeInOrg(admin, orgId, employee_id))) {
    return hrmError("ไม่พบพนักงานในองค์กรนี้", 404);
  }
  const { data, error } = await admin
    .from("hrm_attendance")
    .upsert(
      {
        org_id: orgId,
        employee_id,
        work_date,
        status,
        check_in: (body.check_in as string) || null,
        check_out: (body.check_out as string) || null,
        is_late: Boolean(body.is_late),
        ot_hours: Number(body.ot_hours) || 0,
        note: (body.note as string) || null,
      },
      { onConflict: "org_id,employee_id,work_date" },
    )
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  return upsert(req, Date.now());
}

export async function PATCH(req: NextRequest) {
  return upsert(req, Date.now());
}
