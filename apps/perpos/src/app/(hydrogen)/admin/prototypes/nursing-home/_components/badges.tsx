// badges.tsx — map enum → StatusBadge (tone + ป้ายไทย) สำหรับทุกสถานะที่ใช้บ่อย
// ทุก enum ยึดตาม _fixtures/types.ts · tone จาก @/components/ui/badge (neutral|info|success|warning|danger)
// shared foundation — import: import { ResidentStatusBadge, careLevelLabel } from "../_components/badges";

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  ResidentStatus,
  BedStatus,
  CareLevel,
  InvoiceStatus,
  IncidentSeverity,
  IncidentStatus,
  MedAdminStatus,
  ShiftStatus,
  VitalFlag,
  CarePlanStatus,
  VisitStatus,
  AssignmentStatus,
  CheckinStatus,
  EmploymentStatus,
  ModuleRole,
} from "../_fixtures/types";

type Meta = { tone: BadgeTone; label: string };

// ─── resident_status ───
const RESIDENT_STATUS: Record<ResidentStatus, Meta> = {
  active: { tone: "success", label: "พักอาศัย" },
  prospective: { tone: "info", label: "รอรับเข้า" },
  on_leave: { tone: "warning", label: "ลากลับบ้าน" },
  discharged: { tone: "neutral", label: "จำหน่ายแล้ว" },
  deceased: { tone: "neutral", label: "เสียชีวิต" },
};
export const residentStatusMeta = (s: ResidentStatus): Meta => RESIDENT_STATUS[s];
export function ResidentStatusBadge({ status }: { status: ResidentStatus }) {
  const m = RESIDENT_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── bed_status ───
const BED_STATUS: Record<BedStatus, Meta> = {
  available: { tone: "success", label: "ว่าง" },
  occupied: { tone: "info", label: "มีผู้พัก" },
  reserved: { tone: "warning", label: "จองแล้ว" },
  maintenance: { tone: "neutral", label: "ปิดซ่อม" },
};
export const bedStatusMeta = (s: BedStatus): Meta => BED_STATUS[s];
export function BedStatusBadge({ status }: { status: BedStatus }) {
  const m = BED_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── care_level (ระดับการดูแล) — ใช้ badge info-tone สม่ำเสมอ ป้ายไทย ───
const CARE_LEVEL: Record<CareLevel, string> = {
  independent: "ช่วยเหลือตัวเองได้",
  assisted: "ต้องช่วยเหลือ",
  full_care: "ดูแลเต็มรูปแบบ",
  memory_care: "ดูแลความจำ",
};
export const careLevelLabel = (c: CareLevel): string => CARE_LEVEL[c];
const CARE_LEVEL_TONE: Record<CareLevel, BadgeTone> = {
  independent: "success",
  assisted: "info",
  full_care: "warning",
  memory_care: "danger",
};
export function CareLevelBadge({ level }: { level: CareLevel }) {
  return <StatusBadge tone={CARE_LEVEL_TONE[level]}>{CARE_LEVEL[level]}</StatusBadge>;
}

// ─── invoice_status ───
const INVOICE_STATUS: Record<InvoiceStatus, Meta> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  issued: { tone: "info", label: "ออกบิลแล้ว" },
  partially_paid: { tone: "warning", label: "ชำระบางส่วน" },
  paid: { tone: "success", label: "ชำระครบ" },
  overdue: { tone: "danger", label: "เกินกำหนด" },
  void: { tone: "neutral", label: "ยกเลิก" },
};
export const invoiceStatusMeta = (s: InvoiceStatus): Meta => INVOICE_STATUS[s];
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const m = INVOICE_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── incident_severity ───
const INCIDENT_SEVERITY: Record<IncidentSeverity, Meta> = {
  low: { tone: "neutral", label: "เล็กน้อย" },
  moderate: { tone: "warning", label: "ปานกลาง" },
  high: { tone: "danger", label: "รุนแรง" },
  critical: { tone: "danger", label: "วิกฤต" },
};
export const incidentSeverityMeta = (s: IncidentSeverity): Meta => INCIDENT_SEVERITY[s];
export function IncidentSeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const m = INCIDENT_SEVERITY[severity];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── incident_status ───
const INCIDENT_STATUS: Record<IncidentStatus, Meta> = {
  open: { tone: "danger", label: "เปิด" },
  investigating: { tone: "warning", label: "กำลังสืบสวน" },
  resolved: { tone: "info", label: "แก้ไขแล้ว" },
  closed: { tone: "success", label: "ปิดเคส" },
};
export const incidentStatusMeta = (s: IncidentStatus): Meta => INCIDENT_STATUS[s];
export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const m = INCIDENT_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── med_admin_status (eMAR) ───
const MED_ADMIN_STATUS: Record<MedAdminStatus, Meta> = {
  pending: { tone: "neutral", label: "รอให้ยา" },
  given: { tone: "success", label: "ให้ยาแล้ว" },
  missed: { tone: "danger", label: "พลาดรอบ" },
  refused: { tone: "warning", label: "ปฏิเสธ" },
  held: { tone: "warning", label: "งดยา" },
};
export const medAdminStatusMeta = (s: MedAdminStatus): Meta => MED_ADMIN_STATUS[s];
export function MedAdminStatusBadge({ status }: { status: MedAdminStatus }) {
  const m = MED_ADMIN_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── medication_order.is_active (สถานะคำสั่งยา ใช้งาน/หยุดแล้ว) ───
export function MedActiveBadge({ active }: { active: boolean }) {
  return (
    <StatusBadge tone={active ? "success" : "neutral"}>
      {active ? "ใช้งาน" : "หยุดแล้ว"}
    </StatusBadge>
  );
}

// ─── shift_status ───
const SHIFT_STATUS: Record<ShiftStatus, Meta> = {
  scheduled: { tone: "neutral", label: "จัดเวรแล้ว" },
  confirmed: { tone: "info", label: "ยืนยันแล้ว" },
  completed: { tone: "success", label: "เสร็จสิ้น" },
  absent: { tone: "danger", label: "ขาดเวร" },
};
export const shiftStatusMeta = (s: ShiftStatus): Meta => SHIFT_STATUS[s];
export function ShiftStatusBadge({ status }: { status: ShiftStatus }) {
  const m = SHIFT_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── vital_flag ───
const VITAL_FLAG: Record<VitalFlag, Meta> = {
  normal: { tone: "success", label: "ปกติ" },
  watch: { tone: "warning", label: "เฝ้าระวัง" },
  abnormal: { tone: "danger", label: "ผิดปกติ" },
};
export const vitalFlagMeta = (s: VitalFlag): Meta => VITAL_FLAG[s];
export function VitalFlagBadge({ flag }: { flag: VitalFlag }) {
  const m = VITAL_FLAG[flag];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── care_plan_status ───
const CARE_PLAN_STATUS: Record<CarePlanStatus, Meta> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  active: { tone: "success", label: "ใช้งาน" },
  on_hold: { tone: "warning", label: "พักไว้" },
  completed: { tone: "info", label: "เสร็จสิ้น" },
};
export const carePlanStatusMeta = (s: CarePlanStatus): Meta => CARE_PLAN_STATUS[s];
export function CarePlanStatusBadge({ status }: { status: CarePlanStatus }) {
  const m = CARE_PLAN_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── visit_status ───
const VISIT_STATUS: Record<VisitStatus, Meta> = {
  scheduled: { tone: "info", label: "นัดแล้ว" },
  checked_in: { tone: "warning", label: "กำลังเยี่ยม" },
  completed: { tone: "success", label: "เยี่ยมเสร็จ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};
export const visitStatusMeta = (s: VisitStatus): Meta => VISIT_STATUS[s];
export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  const m = VISIT_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── assignment_status ───
const ASSIGNMENT_STATUS: Record<AssignmentStatus, Meta> = {
  active: { tone: "success", label: "กำลังดูแล" },
  ended: { tone: "neutral", label: "สิ้นสุด" },
};
export const assignmentStatusMeta = (s: AssignmentStatus): Meta => ASSIGNMENT_STATUS[s];
export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const m = ASSIGNMENT_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── checkin_status ───
const CHECKIN_STATUS: Record<CheckinStatus, Meta> = {
  checked_in: { tone: "success", label: "เข้าเวรอยู่" },
  checked_out: { tone: "neutral", label: "ออกเวรแล้ว" },
};
export const checkinStatusMeta = (s: CheckinStatus): Meta => CHECKIN_STATUS[s];
export function CheckinStatusBadge({ status }: { status: CheckinStatus }) {
  const m = CHECKIN_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── employment_status ───
const EMPLOYMENT_STATUS: Record<EmploymentStatus, Meta> = {
  active: { tone: "success", label: "ทำงานอยู่" },
  on_leave: { tone: "warning", label: "ลาพัก" },
  resigned: { tone: "neutral", label: "ลาออก" },
};
export const employmentStatusMeta = (s: EmploymentStatus): Meta => EMPLOYMENT_STATUS[s];
export function EmploymentStatusBadge({ status }: { status: EmploymentStatus }) {
  const m = EMPLOYMENT_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── module_role (ป้ายบทบาทพนักงาน) ───
export const MODULE_ROLE_LABEL: Record<ModuleRole, string> = {
  owner: "เจ้าของ/ผู้จัดการ",
  nurse: "พยาบาลวิชาชีพ",
  caregiver: "ผู้ช่วยดูแล",
  admin_staff: "ธุรการ/การเงิน",
};
export function ModuleRoleBadge({ role }: { role: ModuleRole }) {
  return <StatusBadge tone="info">{MODULE_ROLE_LABEL[role]}</StatusBadge>;
}
