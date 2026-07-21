"use client";

// role-context.tsx — จำลอง role ปัจจุบัน + matrix §4.1 (V/W/A) สำหรับ prototype hotel
// คุมการซ่อน/disable ปุ่มตาม role ที่ผู้พรีเซนเลือก — โชว์ว่าระบบคุมสิทธิ์ได้จริง
// import: import { HotelRoleProvider, useHotelRole } from "../_components/role-context";

import React, { createContext, useContext, useMemo, useState } from "react";

/** 4 role ตาม contract §4 (entry แรก = สิทธิ์สูงสุด) */
export type HotelRole = "owner" | "manager" | "housekeeper" | "viewer";

// V = ดู · W = เพิ่ม/แก้ · A = อนุมัติ/ยืนยันสถานะ
export type Access = "none" | "view" | "write" | "approve";

/** entity key (จับคู่กับแถวใน matrix §4.1) */
export type Entity =
  | "dashboard"
  | "calendar"
  | "room_type_config"
  | "rooms"
  | "bookings"
  | "guests"
  | "payments"
  | "housekeeping"
  | "reports";

// ลำดับสิทธิ์ (มาก→น้อย) — approve ครอบ write ครอบ view
const RANK: Record<Access, number> = { none: 0, view: 1, write: 2, approve: 3 };

// matrix §4.1 — เก็บระดับสูงสุดต่อ (role × entity)
const MATRIX: Record<HotelRole, Record<Entity, Access>> = {
  owner: {
    dashboard: "view",
    calendar: "approve",
    room_type_config: "write",
    rooms: "write",
    bookings: "approve",
    guests: "write",
    payments: "approve",
    housekeeping: "write",
    reports: "view",
  },
  manager: {
    dashboard: "view",
    calendar: "approve",
    room_type_config: "view",
    rooms: "view", // ดูห้อง — แก้ได้เฉพาะ room/hk status (เช็คใน UI)
    bookings: "approve",
    guests: "write",
    payments: "approve",
    housekeeping: "write",
    reports: "view",
  },
  housekeeper: {
    dashboard: "view",
    calendar: "view",
    room_type_config: "none",
    rooms: "view", // แก้ได้เฉพาะ housekeeping_status (เช็คใน UI)
    bookings: "none",
    guests: "none",
    payments: "none",
    housekeeping: "write",
    reports: "none",
  },
  viewer: {
    dashboard: "view",
    calendar: "view",
    room_type_config: "view",
    rooms: "view",
    bookings: "view",
    guests: "view",
    payments: "view",
    housekeeping: "view",
    reports: "view",
  },
};

export const ROLE_LABEL: Record<HotelRole, string> = {
  owner: "เจ้าของ",
  manager: "ผู้จัดการ",
  housekeeper: "แม่บ้าน",
  viewer: "ผู้ดู",
};

export const ROLE_ORDER: HotelRole[] = ["owner", "manager", "housekeeper", "viewer"];

type Action = "view" | "write" | "approve";

interface RoleCtx {
  role: HotelRole;
  setRole: (r: HotelRole) => void;
  /** ระดับสิทธิ์ของ role ปัจจุบันต่อ entity */
  access: (entity: Entity) => Access;
  /** ทำ action นี้กับ entity นี้ได้ไหม (เทียบ rank) */
  can: (action: Action, entity: Entity) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function HotelRoleProvider({
  children,
  defaultRole = "manager",
}: {
  children: React.ReactNode;
  defaultRole?: HotelRole;
}) {
  const [role, setRole] = useState<HotelRole>(defaultRole);

  const value = useMemo<RoleCtx>(() => {
    const access = (entity: Entity): Access => MATRIX[role][entity];
    const can = (action: Action, entity: Entity): boolean => RANK[access(entity)] >= RANK[action];
    return { role, setRole, access, can };
  }, [role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHotelRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useHotelRole ต้องใช้ภายใน <HotelRoleProvider>");
  }
  return ctx;
}
