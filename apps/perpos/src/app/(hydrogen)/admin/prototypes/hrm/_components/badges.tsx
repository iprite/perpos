// badges.tsx — map enum → StatusBadge (tone + ป้ายไทย) สำหรับทุกสถานะ hrm
// ทุก enum ยึดตาม _fixtures/types.ts · tone จาก @/components/ui/badge (neutral|info|success|warning|danger)
// shared foundation — import: import { EmployeeStatusBadge } from "../_components/badges";

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  EmployeeStatus,
  EmploymentType,
  RunStatus,
  LeaveStatus,
  AttendanceStatus,
  DocType,
  DocStatus,
  PayItemType,
  FundType,
  ModuleRole,
} from "../_fixtures/types";

type Meta = { tone: BadgeTone; label: string };

// ─── employee.status ───
const EMPLOYEE_STATUS: Record<EmployeeStatus, Meta> = {
  active: { tone: "success", label: "ทำงานอยู่" },
  inactive: { tone: "neutral", label: "พักงาน" },
  terminated: { tone: "neutral", label: "ออกแล้ว" },
};
export const employeeStatusMeta = (s: EmployeeStatus): Meta => EMPLOYEE_STATUS[s];
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
export const employmentTypeMeta = (t: EmploymentType): Meta => EMPLOYMENT_TYPE[t];
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
export const runStatusMeta = (s: RunStatus): Meta => RUN_STATUS[s];
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
export const leaveStatusMeta = (s: LeaveStatus): Meta => LEAVE_STATUS[s];
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
export const attendanceStatusMeta = (s: AttendanceStatus): Meta => ATTENDANCE_STATUS[s];
export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const m = ATTENDANCE_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── document.doc_type ───
const DOC_TYPE: Record<DocType, Meta> = {
  payslip: { tone: "info", label: "สลิปเงินเดือน" },
  salary_cert: { tone: "success", label: "หนังสือรับรองเงินเดือน" },
  contract: { tone: "neutral", label: "สัญญาจ้าง" },
  other: { tone: "neutral", label: "อื่นๆ" },
};
export const docTypeMeta = (t: DocType): Meta => DOC_TYPE[t];
export function DocTypeBadge({ type }: { type: DocType }) {
  const m = DOC_TYPE[type];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── document.status ───
const DOC_STATUS: Record<DocStatus, Meta> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  issued: { tone: "success", label: "ออกแล้ว" },
};
export const docStatusMeta = (s: DocStatus): Meta => DOC_STATUS[s];
export function DocStatusBadge({ status }: { status: DocStatus }) {
  const m = DOC_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── pay_item.item_type ───
const PAY_ITEM_TYPE: Record<PayItemType, Meta> = {
  earning: { tone: "success", label: "เงินเพิ่ม" },
  deduction: { tone: "danger", label: "เงินหัก" },
};
export const payItemTypeMeta = (t: PayItemType): Meta => PAY_ITEM_TYPE[t];
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
export const fundTypeMeta = (t: FundType): Meta => FUND_TYPE[t];
export function FundTypeBadge({ type }: { type: FundType }) {
  const m = FUND_TYPE[type];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── module_role (ป้ายบทบาท) ───
export const MODULE_ROLE_LABEL: Record<ModuleRole, string> = {
  owner: "เจ้าของ/ผู้ดูแล",
  hr: "ฝ่ายบุคคล",
  viewer: "ผู้ดูข้อมูล",
};
export function ModuleRoleBadge({ role }: { role: ModuleRole }) {
  return <StatusBadge tone="info">{MODULE_ROLE_LABEL[role]}</StatusBadge>;
}
