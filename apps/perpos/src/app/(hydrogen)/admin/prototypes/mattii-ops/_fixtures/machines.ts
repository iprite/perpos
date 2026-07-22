// machines.ts — เครื่องผลิต 3 เครื่องคละประเภท (1 อยู่ maintenance ชั่วคราว)
import type { MattiiMachine } from "./types";
import { MOCK_ORG_ID, daysAgo } from "./helpers";

export const machines: MattiiMachine[] = [
  {
    id: "mac-print",
    org_id: MOCK_ORG_ID,
    code: "PRN-01",
    name: "เครื่องพิมพ์ผ้าซับลิเมชัน หน้ากว้าง 1.6 ม.",
    machine_kind: "fabric_printer",
    status: "running",
    capacity_per_day: 40,
    hourly_cost: 180,
    note: "เครื่องหลัก ใช้พิมพ์ลายทุกออเดอร์",
    created_at: daysAgo(400),
    updated_at: daysAgo(0),
  },
  {
    id: "mac-heat",
    org_id: MOCK_ORG_ID,
    code: "HP-01",
    name: "เครื่องรีดร้อนหน้ากว้าง (Heat Press)",
    machine_kind: "heat_press",
    status: "idle",
    capacity_per_day: 60,
    hourly_cost: 120,
    note: null,
    created_at: daysAgo(400),
    updated_at: daysAgo(1),
  },
  {
    id: "mac-cut",
    org_id: MOCK_ORG_ID,
    code: "CS-01",
    name: "เครื่องตัด & เย็บโพ้งขอบพรม",
    machine_kind: "cut_sew",
    status: "maintenance",
    capacity_per_day: 50,
    hourly_cost: 150,
    note: "เข้าซ่อมบำรุงใบมีดสึก คาดว่ากลับมาใช้งานได้ในอีก 1 วัน",
    created_at: daysAgo(400),
    updated_at: daysAgo(0),
  },
];
