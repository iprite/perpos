// badges.tsx — map enum → StatusBadge (tone + ป้ายไทย) สำหรับสถานะ hrm (production)
// enum ยึดตาม @/lib/hrm/types (= ชื่อคอลัมน์ DB) · tone จาก @/components/ui/badge
// คัดจาก prototype hrm/_components/badges.tsx — repoint type import ไป lib/hrm/types

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  EmployeeStatus,
  EmploymentType,
  RunStatus,
  LeaveStatus,
  AttendanceStatus,
  PayItemType,
  FundType,
  HrmRole,
} from "@/lib/hrm/types";

type Meta = { tone: BadgeTone; label: string };

// ─── employee.status ───
const EMPLOYEE_STATUS: Record<EmployeeStatus, Meta> = {
  active: { tone: "success", label: "ทำงานอยู่" },
  inactive: { tone: "neutral", label: "พักงาน" },
  terminated: { tone: "neutral", label: "ออกแล้ว" },
};
export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const m = EMPLOYEE_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── employment_type ───
const EMPLOYMENT_TYPE: Record<EmploymentType, Meta> = {
  monthly: { tone: "info", label: "รายเดือน" },
  daily: { tone: "warning", label: "รายวัน" },
  contract: { tone: "neutral", label: "สัญญาจ้าง" },
};
export function EmploymentTypeBadge({ type }: { type: EmploymentType }) {
  const m = EMPLOYMENT_TYPE[type];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── payroll_run.status ───
const RUN_STATUS: Record<RunStatus, Meta> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  pending_approval: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "info", label: "อนุมัติแล้ว" },
  paid: { tone: "success", label: "จ่ายแล้ว" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const m = RUN_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── leave_request.status ───
const LEAVE_STATUS: Record<LeaveStatus, Meta> = {
  pending: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "success", label: "อนุมัติ" },
  rejected: { tone: "danger", label: "ไม่อนุมัติ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};
export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const m = LEAVE_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── attendance.status ───
const ATTENDANCE_STATUS: Record<AttendanceStatus, Meta> = {
  present: { tone: "success", label: "มาทำงาน" },
  absent: { tone: "danger", label: "ขาด" },
  leave: { tone: "info", label: "ลา" },
  holiday: { tone: "neutral", label: "วันหยุด" },
};
export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const m = ATTENDANCE_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── pay_item.item_type ───
const PAY_ITEM_TYPE: Record<PayItemType, Meta> = {
  earning: { tone: "success", label: "เงินเพิ่ม" },
  deduction: { tone: "danger", label: "เงินหัก" },
};
export function PayItemTypeBadge({ type }: { type: PayItemType }) {
  const m = PAY_ITEM_TYPE[type];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── fund_type ───
const FUND_TYPE: Record<FundType, Meta> = {
  sso: { tone: "info", label: "ประกันสังคม" },
  pvd: { tone: "info", label: "กองทุนสำรองฯ" },
  gf: { tone: "neutral", label: "กบข." },
  other: { tone: "neutral", label: "อื่นๆ" },
};
export function FundTypeBadge({ type }: { type: FundType }) {
  const m = FUND_TYPE[type];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── module role ───
export const HRM_ROLE_LABEL: Record<HrmRole, string> = {
  owner: "เจ้าของ/ผู้ดูแล",
  hr: "ฝ่ายบุคคล",
  viewer: "ผู้ดูข้อมูล",
};
