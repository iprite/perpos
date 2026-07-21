// housekeeping.ts — งานแม่บ้าน (housekeeping_tasks)
// ผูกกับ checkout → ห้อง dirty → cleaning → clean → inspected
// กระจาย status หลากหลาย

import type { HousekeepingTask } from "./types";
import { MOCK_ORG_ID } from "./room-type-config";

// "วันนี้" = 2026-06-23
export const housekeepingTasks: HousekeepingTask[] = [
  // ---- dirty — รอทำความสะอาด (checkout วันนี้) ----
  {
    id: "hk-001",
    org_id: MOCK_ORG_ID,
    room_id: "room-A106",
    task_date: "2026-06-23",
    status: "dirty",
    assigned_to: null,
    started_at: null,
    completed_at: null,
    note: "กมลวรรณ เช็คเอาท์ 09:30 — รอมอบหมาย",
    created_at: "2026-06-23T09:35:00.000Z",
    updated_at: "2026-06-23T09:35:00.000Z",
  },
  {
    id: "hk-002",
    org_id: MOCK_ORG_ID,
    room_id: "room-V205",
    task_date: "2026-06-23",
    status: "dirty",
    assigned_to: null,
    started_at: null,
    completed_at: null,
    note: "วรากร เช็คเอาท์ 10:00",
    created_at: "2026-06-23T10:05:00.000Z",
    updated_at: "2026-06-23T10:05:00.000Z",
  },
  {
    id: "hk-003",
    org_id: MOCK_ORG_ID,
    room_id: "room-C304",
    task_date: "2026-06-23",
    status: "dirty",
    assigned_to: null,
    started_at: null,
    completed_at: null,
    note: "Siriwan เช็คเอาท์วันนี้",
    created_at: "2026-06-23T10:15:00.000Z",
    updated_at: "2026-06-23T10:15:00.000Z",
  },
  {
    id: "hk-004",
    org_id: MOCK_ORG_ID,
    room_id: "room-A108",
    task_date: "2026-06-23",
    status: "dirty",
    assigned_to: null,
    started_at: null,
    completed_at: null,
    note: "ห้อง maintenance — รอซ่อม",
    created_at: "2026-06-20T09:00:00.000Z",
    updated_at: "2026-06-20T09:00:00.000Z",
  },

  // ---- cleaning — กำลังทำความสะอาด ----
  {
    id: "hk-005",
    org_id: MOCK_ORG_ID,
    room_id: "room-V206",
    task_date: "2026-06-23",
    status: "cleaning",
    assigned_to: "staff-hk-001", // แม่บ้านจำลอง
    started_at: "2026-06-23T10:00:00.000Z",
    completed_at: null,
    note: "แม่บ้านอยู่ระหว่างทำความสะอาด",
    created_at: "2026-06-23T09:50:00.000Z",
    updated_at: "2026-06-23T10:00:00.000Z",
  },
  {
    id: "hk-006",
    org_id: MOCK_ORG_ID,
    room_id: "room-C305",
    task_date: "2026-06-23",
    status: "cleaning",
    assigned_to: "staff-hk-002",
    started_at: "2026-06-23T09:00:00.000Z",
    completed_at: null,
    note: "ปรับปรุงห้องน้ำใหม่ — กำลังดำเนินการ",
    created_at: "2026-06-10T09:00:00.000Z",
    updated_at: "2026-06-23T09:00:00.000Z",
  },

  // ---- clean — สะอาดแล้ว รอตรวจ ----
  {
    id: "hk-007",
    org_id: MOCK_ORG_ID,
    room_id: "room-A109",
    task_date: "2026-06-23",
    status: "clean",
    assigned_to: "staff-hk-001",
    started_at: "2026-06-23T07:30:00.000Z",
    completed_at: "2026-06-23T08:30:00.000Z",
    note: "ทำความสะอาดเสร็จ รอหัวหน้าตรวจ",
    created_at: "2026-06-23T07:30:00.000Z",
    updated_at: "2026-06-23T08:30:00.000Z",
  },
  {
    id: "hk-008",
    org_id: MOCK_ORG_ID,
    room_id: "room-C303",
    task_date: "2026-06-23",
    status: "clean",
    assigned_to: "staff-hk-002",
    started_at: "2026-06-23T08:00:00.000Z",
    completed_at: "2026-06-23T09:30:00.000Z",
    note: "เสร็จแล้ว รอตรวจก่อนขาย",
    created_at: "2026-06-23T08:00:00.000Z",
    updated_at: "2026-06-23T09:30:00.000Z",
  },

  // ---- inspected — ตรวจแล้ว พร้อมขาย ----
  {
    id: "hk-009",
    org_id: MOCK_ORG_ID,
    room_id: "room-A104",
    task_date: "2026-06-23",
    status: "inspected",
    assigned_to: "staff-hk-001",
    started_at: "2026-06-22T14:00:00.000Z",
    completed_at: "2026-06-22T15:00:00.000Z",
    note: "ตรวจแล้ว — ห้องพร้อมสำหรับแขกเช็คอินวันนี้",
    created_at: "2026-06-22T14:00:00.000Z",
    updated_at: "2026-06-22T15:30:00.000Z",
  },
  {
    id: "hk-010",
    org_id: MOCK_ORG_ID,
    room_id: "room-V203",
    task_date: "2026-06-23",
    status: "inspected",
    assigned_to: "staff-hk-002",
    started_at: "2026-06-22T15:00:00.000Z",
    completed_at: "2026-06-22T16:00:00.000Z",
    note: "พร้อมรับแขก Sarah Miller เช็คอินวันนี้",
    created_at: "2026-06-22T15:00:00.000Z",
    updated_at: "2026-06-22T16:15:00.000Z",
  },
  {
    id: "hk-011",
    org_id: MOCK_ORG_ID,
    room_id: "room-C306",
    task_date: "2026-06-23",
    status: "inspected",
    assigned_to: "staff-hk-001",
    started_at: "2026-06-22T16:00:00.000Z",
    completed_at: "2026-06-22T17:00:00.000Z",
    note: "พร้อมรับแขก Chen Mei เช็คอินวันนี้เย็น",
    created_at: "2026-06-22T16:00:00.000Z",
    updated_at: "2026-06-22T17:10:00.000Z",
  },
  {
    id: "hk-012",
    org_id: MOCK_ORG_ID,
    room_id: "room-C302",
    task_date: "2026-06-22",
    status: "inspected",
    assigned_to: "staff-hk-002",
    started_at: "2026-06-22T10:00:00.000Z",
    completed_at: "2026-06-22T11:00:00.000Z",
    note: "พร้อมรับแขก Nakamura พรุ่งนี้",
    created_at: "2026-06-22T10:00:00.000Z",
    updated_at: "2026-06-22T11:15:00.000Z",
  },

  // ---- ประวัติงานเมื่อวาน (checked_out เมื่อวาน) ----
  {
    id: "hk-013",
    org_id: MOCK_ORG_ID,
    room_id: "room-A105",
    task_date: "2026-06-22",
    status: "inspected",
    assigned_to: "staff-hk-001",
    started_at: "2026-06-22T13:30:00.000Z",
    completed_at: "2026-06-22T14:00:00.000Z",
    note: "หลัง hourly checkout เมื่อวาน",
    created_at: "2026-06-22T13:15:00.000Z",
    updated_at: "2026-06-22T14:05:00.000Z",
  },
];

// ---- Summary helper ----
export const hkStatusSummary = {
  dirty: housekeepingTasks.filter((t) => t.status === "dirty" && t.task_date === "2026-06-23")
    .length,
  cleaning: housekeepingTasks.filter((t) => t.status === "cleaning" && t.task_date === "2026-06-23")
    .length,
  clean: housekeepingTasks.filter((t) => t.status === "clean" && t.task_date === "2026-06-23")
    .length,
  inspected: housekeepingTasks.filter(
    (t) => t.status === "inspected" && t.task_date === "2026-06-23",
  ).length,
};
