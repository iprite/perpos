// types.ts — nursing_home fixture types (22 entities + enums)
// ยึดตาม spec §5 Data Contract ตรงเป๊ะ

// ---- Enums ----
export type ResidentStatus = "active" | "discharged" | "on_leave" | "deceased" | "prospective";
export type BedStatus = "available" | "occupied" | "maintenance" | "reserved";
export type CareLevel = "independent" | "assisted" | "full_care" | "memory_care";
export type Gender = "male" | "female" | "other";
export type Relationship = "child" | "spouse" | "sibling" | "relative" | "guardian" | "other";
export type VisitStatus = "scheduled" | "checked_in" | "completed" | "cancelled";
export type CarePlanStatus = "draft" | "active" | "on_hold" | "completed";
export type MedRoute = "oral" | "injection" | "topical" | "inhalation" | "other";
export type MedFrequency = "od" | "bid" | "tid" | "qid" | "prn" | "weekly" | "custom";
export type MedAdminStatus = "pending" | "given" | "missed" | "refused" | "held";
export type DailyLogCategory =
  | "meal"
  | "bathing"
  | "toileting"
  | "mobility"
  | "activity"
  | "mood"
  | "sleep"
  | "other";
export type IncidentType =
  | "fall"
  | "medication_error"
  | "injury"
  | "behavioral"
  | "medical_emergency"
  | "elopement"
  | "other";
export type IncidentSeverity = "low" | "moderate" | "high" | "critical";
export type IncidentStatus = "open" | "investigating" | "resolved" | "closed";
export type StaffRole = "nurse" | "caregiver" | "admin" | "therapist" | "housekeeping" | "other";
export type ModuleRole = "owner" | "nurse" | "caregiver" | "admin_staff";
export type EmploymentStatus = "active" | "on_leave" | "resigned";
export type ShiftType = "morning" | "afternoon" | "night";
export type ShiftStatus = "scheduled" | "confirmed" | "completed" | "absent";
export type AssignmentStatus = "active" | "ended";
export type CheckinStatus = "checked_in" | "checked_out";
export type PackageBillingCycle = "monthly" | "daily";
export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
export type InvoiceItemKind = "package" | "medication" | "procedure" | "extra" | "adjustment";
export type PaymentMethod = "cash" | "transfer" | "card" | "cheque" | "other";
export type VitalFlag = "normal" | "watch" | "abnormal";

// ---- Entity Types ----

/** 1) residents — ผู้พักอาศัย */
export interface Resident {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  gender: Gender;
  birth_date: string;
  national_id?: string | null;
  photo_url?: string | null;
  care_level: CareLevel;
  status: ResidentStatus;
  bed_id?: string | null;
  admission_date?: string | null;
  discharge_date?: string | null;
  discharge_reason?: string | null;
  blood_type?: string | null;
  allergies?: string | null;
  dietary_notes?: string | null;
  emergency_note?: string | null;
  created_at?: string;
}

/** 2) rooms — ห้อง */
export interface Room {
  id: string;
  name: string;
  floor?: number | null;
  room_type: string;
  capacity: number;
  note?: string | null;
  created_at?: string;
}

/** 3) beds — เตียง */
export interface Bed {
  id: string;
  room_id: string;
  name: string;
  status: BedStatus;
  note?: string | null;
  created_at?: string;
}

/** 4) family_contacts — ญาติ/ผู้ติดต่อ */
export interface FamilyContact {
  id: string;
  resident_id: string;
  name: string;
  relationship: Relationship;
  phone: string;
  email?: string | null;
  line_id?: string | null;
  is_primary: boolean;
  is_emergency: boolean;
  note?: string | null;
  created_at?: string;
}

/** 5) visits — การเยี่ยม */
export interface Visit {
  id: string;
  resident_id: string;
  visitor_name: string;
  relationship?: Relationship | null;
  scheduled_at: string;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  status: VisitStatus;
  purpose?: string | null;
  note?: string | null;
  created_at?: string;
}

/** 6) medical_histories — ประวัติ/โรคประจำตัว */
export interface MedicalHistory {
  id: string;
  resident_id: string;
  condition: string;
  diagnosed_at?: string | null;
  severity?: string | null;
  is_chronic: boolean;
  note?: string | null;
  created_at?: string;
}

/** 7) vital_signs — สัญญาณชีพ */
export interface VitalSign {
  id: string;
  resident_id: string;
  measured_at: string;
  recorded_by?: string | null;
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  respiratory_rate?: number | null;
  blood_glucose?: number | null;
  weight?: number | null;
  flag: VitalFlag;
  note?: string | null;
  created_at?: string;
}

/** 8) care_plans — แผนการดูแล */
export interface CarePlan {
  id: string;
  resident_id: string;
  title: string;
  status: CarePlanStatus;
  goal: string;
  start_date: string;
  review_date?: string | null;
  created_by?: string | null;
  note?: string | null;
  created_at?: string;
}

/** 9) care_plan_items — รายการกิจกรรมในแผน */
export interface CarePlanItem {
  id: string;
  care_plan_id: string;
  description: string;
  frequency: string;
  responsible_role?: StaffRole | null;
  is_done: boolean;
  created_at?: string;
}

/** 10) medication_orders — รายการสั่งยา */
export interface MedicationOrder {
  id: string;
  resident_id: string;
  drug_name: string;
  dosage: string;
  route: MedRoute;
  frequency: MedFrequency;
  schedule_times: string[];
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  prescribed_by?: string | null;
  instructions?: string | null;
  created_at?: string;
}

/** 11) medication_administrations — บันทึกการให้ยาแต่ละรอบ (eMAR) */
export interface MedicationAdministration {
  id: string;
  medication_order_id: string;
  resident_id: string;
  scheduled_at: string;
  administered_at?: string | null;
  administered_by?: string | null;
  status: MedAdminStatus;
  reason?: string | null;
  note?: string | null;
  created_at?: string;
}

/** 12) daily_care_logs — บันทึกการดูแลประจำวัน */
export interface DailyCareLog {
  id: string;
  resident_id: string;
  logged_at: string;
  category: DailyLogCategory;
  recorded_by?: string | null;
  detail: string;
  mood?: string | null;
  ai_generated: boolean;
  created_at?: string;
}

/** 13) incident_reports — รายงานเหตุการณ์ */
export interface IncidentReport {
  id: string;
  resident_id?: string | null;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurred_at: string;
  location?: string | null;
  reported_by?: string | null;
  description: string;
  action_taken?: string | null;
  follow_up?: string | null;
  resolved_at?: string | null;
  created_at?: string;
}

/** 14) staff — พนักงาน */
export interface Staff {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  staff_role: StaffRole;
  module_role: ModuleRole;
  phone?: string | null;
  email?: string | null;
  license_no?: string | null;
  employment_status: EmploymentStatus;
  hired_date?: string | null;
  profile_id?: string | null;
  created_at?: string;
}

/** 15) shifts — ตารางเวร */
export interface Shift {
  id: string;
  staff_id: string;
  shift_date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  note?: string | null;
  created_at?: string;
}

/** 16) care_assignments — มอบหมายผู้พักอาศัยต่อพนักงาน */
export interface CareAssignment {
  id: string;
  staff_id: string;
  resident_id: string;
  shift_type?: ShiftType | null;
  start_date: string;
  end_date?: string | null;
  status: AssignmentStatus;
  note?: string | null;
  created_at?: string;
}

/** 17) shift_checkins — เช็คอิน-เอาท์เวร */
export interface ShiftCheckin {
  id: string;
  staff_id: string;
  shift_id?: string | null;
  checkin_at: string;
  checkout_at?: string | null;
  status: CheckinStatus;
  note?: string | null;
  created_at?: string;
}

/** 18) service_packages — แพ็กเกจค่าบริการ */
export interface ServicePackage {
  id: string;
  name: string;
  care_level?: CareLevel | null;
  billing_cycle: PackageBillingCycle;
  price: number;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
}

/** 19) resident_subscriptions — ผูกผู้พักกับแพ็กเกจ */
export interface ResidentSubscription {
  id: string;
  resident_id: string;
  package_id: string;
  monthly_price: number;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  created_at?: string;
}

/** 20) invoices — ใบแจ้งหนี้/บิล */
export interface Invoice {
  id: string;
  invoice_no: string;
  resident_id: string;
  period_month: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  note?: string | null;
  created_at?: string;
}

/** 21) invoice_items — รายการในบิล */
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  kind: InvoiceItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  ref_id?: string | null;
  created_at?: string;
}

/** 22) payments — การรับชำระ */
export interface Payment {
  id: string;
  invoice_id: string;
  paid_at: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  received_by?: string | null;
  note?: string | null;
  created_at?: string;
}
