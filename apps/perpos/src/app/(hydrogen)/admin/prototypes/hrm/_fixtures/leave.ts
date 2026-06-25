// leave.ts — leave_types (4 ประเภท) + leave_requests (9 ใบ)
// ยึดตาม spec §4.7–4.8
// cross-ref: employee_id ตรง employees.ts (emp-001..007)
// leave_type_id ตรง leave_types ด้านล่าง

import type { LeaveType, LeaveRequest } from "./types";

// ---- hrm_leave_types ----
export const MOCK_LEAVE_TYPES: LeaveType[] = [
  {
    id: "lt-001",
    org_id: "org-demo",
    code: "sick",
    name: "ลาป่วย",
    quota_days_per_year: 30,
    is_paid: true,
    active: true,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "lt-002",
    org_id: "org-demo",
    code: "personal",
    name: "ลากิจ",
    quota_days_per_year: 3,
    is_paid: true,
    active: true,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "lt-003",
    org_id: "org-demo",
    code: "vacation",
    name: "ลาพักร้อน",
    quota_days_per_year: 6,
    is_paid: true,
    active: true,
    created_at: "2020-01-01T00:00:00Z",
  },
  {
    id: "lt-004",
    org_id: "org-demo",
    code: "unpaid",
    name: "ลาไม่รับค่าจ้าง",
    quota_days_per_year: 0, // ไม่จำกัด
    is_paid: false,
    active: true,
    created_at: "2020-01-01T00:00:00Z",
  },
];

// ---- hrm_leave_requests ----
// สถานะผสม: pending (รออนุมัติ) 3 ใบ, approved 4 ใบ, rejected 1 ใบ, cancelled 1 ใบ
export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    // ลาป่วย (approved) — emp-004 ปาลิตา ป่วย 1 วัน (มิ.ย.)
    id: "lr-001",
    org_id: "org-demo",
    employee_id: "emp-004",
    leave_type_id: "lt-001",
    start_date: "2026-06-12",
    end_date: "2026-06-12",
    days: 1,
    reason: "ไข้หวัด มีใบรับรองแพทย์",
    status: "approved",
    approved_by: "emp-001",
    decided_at: "2026-06-11T14:30:00Z",
    created_at: "2026-06-11T09:00:00Z",
  },
  {
    // ลาพักร้อน (approved) — emp-002 นภาพร ลาพักร้อน 3 วัน (พ.ค.)
    id: "lr-002",
    org_id: "org-demo",
    employee_id: "emp-002",
    leave_type_id: "lt-003",
    start_date: "2026-05-05",
    end_date: "2026-05-07",
    days: 3,
    reason: "ไปเที่ยวพักผ่อนกับครอบครัว",
    status: "approved",
    approved_by: "emp-001",
    decided_at: "2026-04-28T10:00:00Z",
    created_at: "2026-04-25T09:00:00Z",
  },
  {
    // ลากิจ (approved) — emp-005 กิตติศักดิ์ กิจส่วนตัว 1 วัน
    id: "lr-003",
    org_id: "org-demo",
    employee_id: "emp-005",
    leave_type_id: "lt-002",
    start_date: "2026-06-02",
    end_date: "2026-06-02",
    days: 1,
    reason: "ธุระส่วนตัว ต่ออายุบัตรประชาชน",
    status: "approved",
    approved_by: "emp-001",
    decided_at: "2026-06-01T11:00:00Z",
    created_at: "2026-05-30T15:00:00Z",
  },
  {
    // ลาป่วย (approved) — emp-006 วรรณา ลา 2 วัน
    id: "lr-004",
    org_id: "org-demo",
    employee_id: "emp-006",
    leave_type_id: "lt-001",
    start_date: "2026-05-19",
    end_date: "2026-05-20",
    days: 2,
    reason: "ไม่สบาย ปวดหัว มีใบรับรองแพทย์",
    status: "approved",
    approved_by: "emp-001",
    decided_at: "2026-05-18T16:00:00Z",
    created_at: "2026-05-18T08:30:00Z",
  },
  {
    // ลาพักร้อน (pending — รออนุมัติ) — emp-003 ธนพล ลา 2 วัน กลางเดือน ก.ค.
    id: "lr-005",
    org_id: "org-demo",
    employee_id: "emp-003",
    leave_type_id: "lt-003",
    start_date: "2026-07-07",
    end_date: "2026-07-08",
    days: 2,
    reason: "ลาพักร้อนก่อนหมดสัญญา",
    status: "pending",
    approved_by: null,
    decided_at: null,
    created_at: "2026-06-23T10:00:00Z",
  },
  {
    // ลากิจ (pending — รออนุมัติ) — emp-002 นภาพร กิจส่วนตัวเร่งด่วน
    id: "lr-006",
    org_id: "org-demo",
    employee_id: "emp-002",
    leave_type_id: "lt-002",
    start_date: "2026-06-26",
    end_date: "2026-06-26",
    days: 1,
    reason: "ต้องพาแม่ไปหาหมอ",
    status: "pending",
    approved_by: null,
    decided_at: null,
    created_at: "2026-06-24T08:00:00Z",
  },
  {
    // ลาป่วย (pending — รออนุมัติ) — emp-004 ปาลิตา ลา 1 วัน วันนี้
    id: "lr-007",
    org_id: "org-demo",
    employee_id: "emp-004",
    leave_type_id: "lt-001",
    start_date: "2026-06-25",
    end_date: "2026-06-25",
    days: 1,
    reason: "ปวดท้อง ไม่สามารถมาทำงานได้",
    status: "pending",
    approved_by: null,
    decided_at: null,
    created_at: "2026-06-24T07:15:00Z",
  },
  {
    // ลาไม่รับค่าจ้าง (rejected) — emp-007 อรรถพล ขอลา 5 วัน แต่ถูกปฏิเสธ (งานล้น)
    id: "lr-008",
    org_id: "org-demo",
    employee_id: "emp-007",
    leave_type_id: "lt-004",
    start_date: "2026-06-15",
    end_date: "2026-06-19",
    days: 5,
    reason: "กลับต่างจังหวัดช่วงงานบุญ",
    status: "rejected",
    approved_by: "emp-001",
    decided_at: "2026-06-10T09:00:00Z",
    created_at: "2026-06-08T14:00:00Z",
  },
  {
    // ลาพักร้อน (cancelled) — emp-005 กิตติศักดิ์ ยกเลิกเอง
    id: "lr-009",
    org_id: "org-demo",
    employee_id: "emp-005",
    leave_type_id: "lt-003",
    start_date: "2026-06-08",
    end_date: "2026-06-09",
    days: 2,
    reason: "ลาพักร้อน",
    status: "cancelled",
    approved_by: null,
    decided_at: null,
    created_at: "2026-06-01T09:00:00Z",
  },
];

// ---- Helper: วันลาคงเหลือต่อคน (ปี 2026) ----
// คำนวณจาก approved leave ต่อ leave_type
export type LeaveBalance = {
  employee_id: string;
  sick_used: number;
  sick_remaining: number;
  personal_used: number;
  personal_remaining: number;
  vacation_used: number;
  vacation_remaining: number;
};

export const MOCK_LEAVE_BALANCES: LeaveBalance[] = [
  {
    employee_id: "emp-001",
    sick_used: 0,
    sick_remaining: 30,
    personal_used: 0,
    personal_remaining: 3,
    vacation_used: 0,
    vacation_remaining: 6,
  },
  {
    employee_id: "emp-002",
    sick_used: 0,
    sick_remaining: 30,
    personal_used: 1,
    personal_remaining: 2,
    vacation_used: 3,
    vacation_remaining: 3,
  },
  {
    employee_id: "emp-003",
    sick_used: 0,
    sick_remaining: 30,
    personal_used: 0,
    personal_remaining: 3,
    vacation_used: 0,
    vacation_remaining: 6,
  },
  {
    employee_id: "emp-004",
    sick_used: 1,
    sick_remaining: 29,
    personal_used: 0,
    personal_remaining: 3,
    vacation_used: 0,
    vacation_remaining: 6,
  },
  {
    employee_id: "emp-005",
    sick_used: 0,
    sick_remaining: 30,
    personal_used: 1,
    personal_remaining: 2,
    vacation_used: 0,
    vacation_remaining: 6,
  },
  {
    employee_id: "emp-006",
    sick_used: 2,
    sick_remaining: 28,
    personal_used: 0,
    personal_remaining: 3,
    vacation_used: 0,
    vacation_remaining: 6,
  },
  {
    employee_id: "emp-007",
    sick_used: 0,
    sick_remaining: 30,
    personal_used: 0,
    personal_remaining: 3,
    vacation_used: 0,
    vacation_remaining: 6,
  },
];
