// time.ts — attendance (hrm_attendance) รายวัน มิ.ย. 2026
// ยึดตาม spec §4.9
// สร้างของพนักงาน active 5 คน (emp-001..006 ยกเว้น emp-007 daily/flex)
// วันทำงาน: 1–24 มิ.ย. 2026 (ไม่รวมเสาร์-อาทิตย์ + วันหยุด)
// วันหยุดนักขัตฤกษ์ มิ.ย. 2026: 3 มิ.ย. (วันเฉลิมฯ ร.10)
// เสาร์-อาทิตย์: 6-7, 13-14, 20-21 มิ.ย.
// วันทำงานจริง: 1,2,4,5,8,9,10,11,12,15,16,17,18,19,22,23,24 = 17 วัน

import type { Attendance } from "./types";

// เวลาเข้างานปกติ = 09:00, สาย = หลัง 09:00
// check_in: สาย = "09:15" ถึง "09:45"

const ORG_ID = "org-demo";

// helper สร้าง attendance record
function att(
  id: string,
  employeeId: string,
  workDate: string,
  status: Attendance["status"],
  checkIn: string | null,
  checkOut: string | null,
  isLate: boolean,
  otHours: number,
  note?: string,
): Attendance {
  return {
    id,
    org_id: ORG_ID,
    employee_id: employeeId,
    work_date: workDate,
    status,
    check_in: checkIn,
    check_out: checkOut,
    is_late: isLate,
    ot_hours: otHours,
    note: note ?? null,
    created_at: `${workDate}T00:00:00Z`,
  };
}

export const MOCK_ATTENDANCE: Attendance[] = [
  // ============ emp-001 สุรชัย (ผจก.) ============
  att("att-001-0601", "emp-001", "2026-06-01", "present", "08:45", "18:30", false, 1.5),
  att("att-001-0602", "emp-001", "2026-06-02", "present", "08:50", "18:00", false, 0),
  att("att-001-0603", "emp-001", "2026-06-03", "holiday", null, null, false, 0, "วันเฉลิมฯ ร.10"),
  att("att-001-0604", "emp-001", "2026-06-04", "present", "08:55", "18:00", false, 0),
  att("att-001-0605", "emp-001", "2026-06-05", "present", "08:40", "19:00", false, 2),
  att("att-001-0608", "emp-001", "2026-06-08", "present", "09:00", "18:00", false, 0),
  att("att-001-0609", "emp-001", "2026-06-09", "present", "08:50", "18:00", false, 0),
  att("att-001-0610", "emp-001", "2026-06-10", "present", "08:45", "18:00", false, 0),
  att("att-001-0611", "emp-001", "2026-06-11", "present", "09:00", "18:00", false, 0),
  att("att-001-0612", "emp-001", "2026-06-12", "present", "08:55", "18:30", false, 0.5),
  att("att-001-0615", "emp-001", "2026-06-15", "present", "08:50", "18:00", false, 0),
  att("att-001-0616", "emp-001", "2026-06-16", "present", "08:45", "18:00", false, 0),
  att("att-001-0617", "emp-001", "2026-06-17", "present", "09:00", "18:00", false, 0),
  att("att-001-0618", "emp-001", "2026-06-18", "present", "08:55", "18:00", false, 0),
  att("att-001-0619", "emp-001", "2026-06-19", "present", "08:50", "19:00", false, 1),
  att("att-001-0622", "emp-001", "2026-06-22", "present", "08:45", "18:00", false, 0),
  att("att-001-0623", "emp-001", "2026-06-23", "present", "09:00", "18:00", false, 0),
  att("att-001-0624", "emp-001", "2026-06-24", "present", "08:50", "18:00", false, 0),

  // ============ emp-002 นภาพร (ออกแบบ) — สาย 1 ครั้ง (16 มิ.ย.) ============
  att("att-002-0601", "emp-002", "2026-06-01", "present", "09:00", "18:00", false, 0),
  att("att-002-0602", "emp-002", "2026-06-02", "present", "09:05", "18:00", false, 0),
  att("att-002-0603", "emp-002", "2026-06-03", "holiday", null, null, false, 0, "วันเฉลิมฯ ร.10"),
  att("att-002-0604", "emp-002", "2026-06-04", "present", "08:55", "18:00", false, 0),
  att("att-002-0605", "emp-002", "2026-06-05", "present", "09:00", "18:00", false, 0),
  att("att-002-0608", "emp-002", "2026-06-08", "present", "08:50", "18:00", false, 0),
  att("att-002-0609", "emp-002", "2026-06-09", "present", "09:00", "18:00", false, 0),
  att("att-002-0610", "emp-002", "2026-06-10", "present", "08:55", "18:00", false, 0),
  att("att-002-0611", "emp-002", "2026-06-11", "present", "09:00", "18:00", false, 0),
  att("att-002-0612", "emp-002", "2026-06-12", "present", "09:00", "18:00", false, 0),
  att("att-002-0615", "emp-002", "2026-06-15", "present", "09:00", "18:00", false, 0),
  att("att-002-0616", "emp-002", "2026-06-16", "present", "09:25", "18:00", true, 0, "รถติด"),
  att("att-002-0617", "emp-002", "2026-06-17", "present", "09:00", "18:00", false, 0),
  att("att-002-0618", "emp-002", "2026-06-18", "present", "09:00", "18:00", false, 0),
  att("att-002-0619", "emp-002", "2026-06-19", "present", "09:00", "18:30", false, 0.5),
  att("att-002-0622", "emp-002", "2026-06-22", "present", "09:00", "18:00", false, 0),
  att("att-002-0623", "emp-002", "2026-06-23", "present", "09:00", "18:00", false, 0),
  att("att-002-0624", "emp-002", "2026-06-24", "present", "09:00", "18:00", false, 0),

  // ============ emp-003 ธนพล (การตลาด) — OT มาก ============
  att("att-003-0601", "emp-003", "2026-06-01", "present", "08:30", "18:00", false, 0),
  att("att-003-0602", "emp-003", "2026-06-02", "present", "08:45", "19:00", false, 1),
  att("att-003-0603", "emp-003", "2026-06-03", "holiday", null, null, false, 0, "วันเฉลิมฯ ร.10"),
  att("att-003-0604", "emp-003", "2026-06-04", "present", "08:30", "19:30", false, 1.5),
  att("att-003-0605", "emp-003", "2026-06-05", "present", "08:45", "18:00", false, 0),
  att("att-003-0608", "emp-003", "2026-06-08", "present", "08:30", "19:00", false, 1),
  att("att-003-0609", "emp-003", "2026-06-09", "present", "08:45", "18:00", false, 0),
  att("att-003-0610", "emp-003", "2026-06-10", "present", "08:30", "18:00", false, 0),
  att("att-003-0611", "emp-003", "2026-06-11", "present", "08:45", "18:00", false, 0),
  att("att-003-0612", "emp-003", "2026-06-12", "present", "08:30", "19:30", false, 1.5),
  att("att-003-0615", "emp-003", "2026-06-15", "present", "08:45", "18:00", false, 0),
  att("att-003-0616", "emp-003", "2026-06-16", "present", "08:30", "18:00", false, 0),
  att("att-003-0617", "emp-003", "2026-06-17", "present", "08:45", "18:00", false, 0),
  att("att-003-0618", "emp-003", "2026-06-18", "present", "08:30", "19:00", false, 1),
  att("att-003-0619", "emp-003", "2026-06-19", "present", "08:45", "18:00", false, 0),
  att("att-003-0622", "emp-003", "2026-06-22", "present", "08:30", "18:00", false, 0),
  att("att-003-0623", "emp-003", "2026-06-23", "present", "08:45", "18:00", false, 0),
  att("att-003-0624", "emp-003", "2026-06-24", "present", "08:30", "18:00", false, 0),

  // ============ emp-004 ปาลิตา (คอนเทนต์) — ขาด 1 วัน (12 มิ.ย.) สาย 2 ครั้ง ============
  att("att-004-0601", "emp-004", "2026-06-01", "present", "09:10", "18:00", true, 0, "สาย"),
  att("att-004-0602", "emp-004", "2026-06-02", "present", "09:00", "18:00", false, 0),
  att("att-004-0603", "emp-004", "2026-06-03", "holiday", null, null, false, 0, "วันเฉลิมฯ ร.10"),
  att("att-004-0604", "emp-004", "2026-06-04", "present", "09:00", "18:00", false, 0),
  att("att-004-0605", "emp-004", "2026-06-05", "present", "09:00", "18:00", false, 0),
  att("att-004-0608", "emp-004", "2026-06-08", "present", "09:00", "18:00", false, 0),
  att("att-004-0609", "emp-004", "2026-06-09", "present", "09:30", "18:00", true, 0, "รถเสีย"),
  att("att-004-0610", "emp-004", "2026-06-10", "present", "09:00", "18:00", false, 0),
  att("att-004-0611", "emp-004", "2026-06-11", "present", "09:00", "18:00", false, 0),
  att("att-004-0612", "emp-004", "2026-06-12", "leave", null, null, false, 0, "ลาป่วย (lr-001)"),
  att("att-004-0615", "emp-004", "2026-06-15", "present", "09:00", "18:00", false, 0),
  att("att-004-0616", "emp-004", "2026-06-16", "present", "09:00", "18:00", false, 0),
  att("att-004-0617", "emp-004", "2026-06-17", "present", "09:00", "18:00", false, 0),
  att("att-004-0618", "emp-004", "2026-06-18", "present", "09:00", "18:00", false, 0),
  att("att-004-0619", "emp-004", "2026-06-19", "present", "09:00", "18:00", false, 0),
  att("att-004-0622", "emp-004", "2026-06-22", "absent", null, null, false, 0, "ขาดงานไม่แจ้ง"),
  att("att-004-0623", "emp-004", "2026-06-23", "present", "09:00", "18:00", false, 0),
  att("att-004-0624", "emp-004", "2026-06-24", "present", "09:00", "18:00", false, 0),

  // ============ emp-005 กิตติศักดิ์ (เทค) — OT เยอะมาก ============
  att("att-005-0601", "emp-005", "2026-06-01", "present", "09:00", "20:00", false, 2),
  att("att-005-0602", "emp-005", "2026-06-02", "present", "09:00", "20:00", false, 2),
  att("att-005-0603", "emp-005", "2026-06-03", "holiday", null, null, false, 0, "วันเฉลิมฯ ร.10"),
  att("att-005-0604", "emp-005", "2026-06-04", "present", "09:00", "18:00", false, 0),
  att("att-005-0605", "emp-005", "2026-06-05", "present", "09:00", "18:00", false, 0),
  att("att-005-0608", "emp-005", "2026-06-08", "present", "09:00", "18:00", false, 0),
  att("att-005-0609", "emp-005", "2026-06-09", "present", "09:00", "18:00", false, 0),
  att("att-005-0610", "emp-005", "2026-06-10", "present", "09:00", "19:30", false, 1.5),
  att("att-005-0611", "emp-005", "2026-06-11", "present", "09:00", "18:00", false, 0),
  att("att-005-0612", "emp-005", "2026-06-12", "present", "09:00", "18:00", false, 0),
  att("att-005-0615", "emp-005", "2026-06-15", "present", "09:00", "18:00", false, 0),
  att("att-005-0616", "emp-005", "2026-06-16", "present", "09:00", "18:00", false, 0),
  att("att-005-0617", "emp-005", "2026-06-17", "present", "09:00", "19:00", false, 1),
  att("att-005-0618", "emp-005", "2026-06-18", "present", "09:00", "18:00", false, 0),
  att("att-005-0619", "emp-005", "2026-06-19", "present", "09:00", "19:30", false, 1.5),
  att("att-005-0622", "emp-005", "2026-06-22", "present", "09:00", "18:00", false, 0),
  att("att-005-0623", "emp-005", "2026-06-23", "present", "09:00", "18:00", false, 0),
  att("att-005-0624", "emp-005", "2026-06-24", "present", "09:00", "18:00", false, 0),

  // ============ emp-006 วรรณา (บัญชี) — ขึ้นงานตรงเวลาเสมอ ============
  att("att-006-0601", "emp-006", "2026-06-01", "present", "08:55", "17:30", false, 0),
  att("att-006-0602", "emp-006", "2026-06-02", "present", "08:50", "17:30", false, 0),
  att("att-006-0603", "emp-006", "2026-06-03", "holiday", null, null, false, 0, "วันเฉลิมฯ ร.10"),
  att("att-006-0604", "emp-006", "2026-06-04", "present", "08:55", "17:30", false, 0),
  att("att-006-0605", "emp-006", "2026-06-05", "present", "09:00", "17:30", false, 0),
  att("att-006-0608", "emp-006", "2026-06-08", "present", "08:50", "17:30", false, 0),
  att("att-006-0609", "emp-006", "2026-06-09", "present", "08:55", "17:30", false, 0),
  att("att-006-0610", "emp-006", "2026-06-10", "present", "09:00", "17:30", false, 0),
  att("att-006-0611", "emp-006", "2026-06-11", "present", "08:55", "17:30", false, 0),
  att("att-006-0612", "emp-006", "2026-06-12", "present", "09:00", "17:30", false, 0),
  att("att-006-0615", "emp-006", "2026-06-15", "present", "08:50", "17:30", false, 0),
  att("att-006-0616", "emp-006", "2026-06-16", "present", "09:00", "17:30", false, 0),
  att("att-006-0617", "emp-006", "2026-06-17", "present", "08:55", "17:30", false, 0),
  att("att-006-0618", "emp-006", "2026-06-18", "present", "09:00", "17:30", false, 0),
  att("att-006-0619", "emp-006", "2026-06-19", "present", "08:55", "17:30", false, 0),
  att("att-006-0622", "emp-006", "2026-06-22", "present", "09:00", "17:30", false, 0),
  att("att-006-0623", "emp-006", "2026-06-23", "present", "08:50", "17:30", false, 0),
  att("att-006-0624", "emp-006", "2026-06-24", "present", "09:00", "17:30", false, 0),
];

// ---- Helper: สรุปเดือน มิ.ย. รายคน ----
export type AttendanceSummary = {
  employee_id: string;
  present_days: number;
  absent_days: number;
  leave_days: number;
  holiday_days: number;
  late_count: number;
  total_ot_hours: number;
};

export function summarizeAttendanceByEmployee(employeeId: string): AttendanceSummary {
  const records = MOCK_ATTENDANCE.filter((a) => a.employee_id === employeeId);
  return {
    employee_id: employeeId,
    present_days: records.filter((a) => a.status === "present").length,
    absent_days: records.filter((a) => a.status === "absent").length,
    leave_days: records.filter((a) => a.status === "leave").length,
    holiday_days: records.filter((a) => a.status === "holiday").length,
    late_count: records.filter((a) => a.is_late).length,
    total_ot_hours: records.reduce((s, a) => s + a.ot_hours, 0),
  };
}
