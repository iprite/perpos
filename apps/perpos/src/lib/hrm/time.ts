/**
 * time.ts — fetch logic เวลาทำงาน (attendance รายวัน). RLS-scoped client.
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attendance } from "@/lib/hrm/types";

/** ช่วงวันของเดือน (CE) — start..end inclusive */
function monthRange(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export async function listAttendance(
  db: SupabaseClient,
  orgId: string,
  opts: { employeeId?: string; year: number; month: number },
): Promise<Attendance[]> {
  const { from, to } = monthRange(opts.year, opts.month);
  let q = db
    .from("hrm_attendance")
    .select("*")
    .eq("org_id", orgId)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: true });
  if (opts.employeeId) q = q.eq("employee_id", opts.employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Attendance[];
}

export interface AttendanceSummary {
  employee_id: string;
  present_days: number;
  absent_days: number;
  leave_days: number;
  holiday_days: number;
  late_count: number;
  ot_hours: number;
}

/**
 * summarizeAttendance — สรุปต่อพนักงานในเดือน (ป้อนเข้าการคำนวณเงินเดือน).
 * absent_days/ot_hours/late_count = input ของ computePayslip.
 */
export function summarizeAttendance(rows: Attendance[]): Map<string, AttendanceSummary> {
  const map = new Map<string, AttendanceSummary>();
  for (const r of rows) {
    let s = map.get(r.employee_id);
    if (!s) {
      s = {
        employee_id: r.employee_id,
        present_days: 0,
        absent_days: 0,
        leave_days: 0,
        holiday_days: 0,
        late_count: 0,
        ot_hours: 0,
      };
      map.set(r.employee_id, s);
    }
    if (r.status === "present") s.present_days += 1;
    else if (r.status === "absent") s.absent_days += 1;
    else if (r.status === "leave") s.leave_days += 1;
    else if (r.status === "holiday") s.holiday_days += 1;
    if (r.is_late) s.late_count += 1;
    s.ot_hours += Number(r.ot_hours || 0);
  }
  return map;
}

/** ดึง + สรุปเวลาในเดือน (helper รวมสำหรับ payroll calculate) */
export async function getMonthlyAttendanceSummary(
  db: SupabaseClient,
  orgId: string,
  year: number,
  month: number,
): Promise<Map<string, AttendanceSummary>> {
  const rows = await listAttendance(db, orgId, { year, month });
  return summarizeAttendance(rows);
}
