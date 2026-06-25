"use client";

// role-context.tsx — จำลอง role ปัจจุบัน + matrix สิทธิ์ (V/W/A) สำหรับ prototype hrm
// ใช้คุมการซ่อน/disable ปุ่มตาม role ที่ผู้พรีเซนเลือก — โชว์ว่าระบบคุมสิทธิ์ได้จริง
// import: import { HrmRoleProvider, useHrmRole } from "../_components/role-context";
// 3 roles ตาม spec §5: owner / hr / viewer

import React, { createContext, useContext, useMemo, useState } from "react";
import type { ModuleRole } from "../_fixtures/types";

// ─── สิทธิ์ระดับ entity ───
// V = ดู · W = เพิ่ม/แก้ · A = อนุมัติ/ยืนยันการจ่าย
export type Access = "none" | "view" | "write" | "approve";

/** entity key (จับคู่กับเมนู §3) */
export type Entity =
  | "dashboard"
  | "employees"
  | "payroll"
  | "leave"
  | "time"
  | "settings"
  | "documents";

// ลำดับสิทธิ์ (มาก→น้อย) — approve ครอบ write ครอบ view
const RANK: Record<Access, number> = { none: 0, view: 1, write: 2, approve: 3 };

// matrix §5 — เก็บระดับสูงสุดต่อ (role × entity)
// owner = เห็น+ทำทุกอย่าง รวมอนุมัติการจ่ายเงินเดือน
// hr = จัดการพนักงาน/ลา/เวลา/เอกสาร + อนุมัติใบลา แต่ "อนุมัติการจ่ายเงินเดือน" = owner เท่านั้น (hr = write)
// viewer = ดูอย่างเดียว
const MATRIX: Record<ModuleRole, Record<Entity, Access>> = {
  owner: {
    dashboard: "view",
    employees: "approve",
    payroll: "approve", // อนุมัติ/จ่ายเงินเดือนได้
    leave: "approve",
    time: "approve",
    settings: "write",
    documents: "approve",
  },
  hr: {
    dashboard: "view",
    employees: "write",
    payroll: "write", // ทำรอบ/คำนวณได้ แต่ "อนุมัติจ่าย" สงวนให้ owner
    leave: "approve", // อนุมัติใบลาได้
    time: "write",
    settings: "write",
    documents: "write",
  },
  viewer: {
    dashboard: "view",
    employees: "view",
    payroll: "view",
    leave: "view",
    time: "view",
    settings: "view",
    documents: "view",
  },
};

export const ROLE_LABEL: Record<ModuleRole, string> = {
  owner: "เจ้าของ/ผู้ดูแล",
  hr: "ฝ่ายบุคคล",
  viewer: "ผู้ดูข้อมูล",
};

export const ROLE_ORDER: ModuleRole[] = ["owner", "hr", "viewer"];

type Action = "view" | "write" | "approve";

interface RoleCtx {
  role: ModuleRole;
  setRole: (r: ModuleRole) => void;
  /** ระดับสิทธิ์ของ role ปัจจุบันต่อ entity */
  access: (entity: Entity) => Access;
  /** ทำ action นี้กับ entity นี้ได้ไหม (เทียบ rank) */
  can: (action: Action, entity: Entity) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function HrmRoleProvider({
  children,
  defaultRole = "owner",
}: {
  children: React.ReactNode;
  defaultRole?: ModuleRole;
}) {
  const [role, setRole] = useState<ModuleRole>(defaultRole);

  const value = useMemo<RoleCtx>(() => {
    const access = (entity: Entity): Access => MATRIX[role][entity];
    const can = (action: Action, entity: Entity): boolean => RANK[access(entity)] >= RANK[action];
    return { role, setRole, access, can };
  }, [role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHrmRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useHrmRole ต้องใช้ภายใน <HrmRoleProvider>");
  }
  return ctx;
}
