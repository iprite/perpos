"use client";

// role-context.tsx — จำลอง role lens (owner/manager/staff/viewer) + field-lock matrix §1
// คุมการซ่อน/disable ปุ่ม + read-only banner ตาม role ที่ผู้พรีเซนเลือก
// import: import { GolfRoleProvider, useGolfRole } from "../_components/role-context";

import React, { createContext, useContext, useMemo, useState } from "react";

/** 4 role ตาม contract §1 (entry แรก = สิทธิ์สูงสุด) */
export type GolfRole = "owner" | "manager" | "staff" | "viewer";

export type Access = "none" | "view" | "write";

/** entity key = route segment (จับคู่กับ MATRIX field-lock §1) */
export type GolfEntity =
  | "dashboard"
  | "tee_times"
  | "driving_range"
  | "bookings"
  | "members"
  | "membership"
  | "pricing"
  | "reports"
  | "line_preview"
  | "settings";

const RANK: Record<Access, number> = { none: 0, view: 1, write: 2 };

// MATRIX §1 — staff ทำ booking ops ได้เต็ม แต่ pricing/membership/reports(เชิงลึก)/settings = read-only
// viewer = ดูอย่างเดียวทั้ง module
const MATRIX: Record<GolfRole, Record<GolfEntity, Access>> = {
  owner: {
    dashboard: "view",
    tee_times: "write",
    driving_range: "write",
    bookings: "write",
    members: "write",
    membership: "write",
    pricing: "write",
    reports: "view",
    line_preview: "view",
    settings: "write",
  },
  manager: {
    dashboard: "view",
    tee_times: "write",
    driving_range: "write",
    bookings: "write",
    members: "write",
    membership: "write",
    pricing: "write",
    reports: "view",
    line_preview: "view",
    settings: "write",
  },
  staff: {
    dashboard: "view",
    tee_times: "write",
    driving_range: "write",
    bookings: "write",
    members: "write",
    membership: "view", // read-only banner
    pricing: "view", // read-only banner
    reports: "view", // เห็นสรุปพื้นฐาน + banner ล็อกเชิงลึก
    line_preview: "view",
    settings: "view", // read-only banner
  },
  viewer: {
    dashboard: "view",
    tee_times: "view",
    driving_range: "view",
    bookings: "view",
    members: "view",
    membership: "view",
    pricing: "view",
    reports: "view",
    line_preview: "view",
    settings: "view",
  },
};

export const ROLE_LABEL: Record<GolfRole, string> = {
  owner: "เจ้าของ/GM",
  manager: "ผู้จัดการ",
  staff: "พนักงานเคาน์เตอร์",
  viewer: "ผู้ดู/บัญชี",
};

export const ROLE_ORDER: GolfRole[] = ["owner", "manager", "staff", "viewer"];

type Action = "view" | "write";

interface RoleCtx {
  role: GolfRole;
  setRole: (r: GolfRole) => void;
  access: (entity: GolfEntity) => Access;
  can: (action: Action, entity: GolfEntity) => boolean;
  /** shorthand — เขียนกับ entity นี้ได้ไหม */
  canWrite: (entity: GolfEntity) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function GolfRoleProvider({
  children,
  defaultRole = "manager",
}: {
  children: React.ReactNode;
  defaultRole?: GolfRole;
}) {
  const [role, setRole] = useState<GolfRole>(defaultRole);

  const value = useMemo<RoleCtx>(() => {
    const access = (entity: GolfEntity): Access => MATRIX[role][entity];
    const can = (action: Action, entity: GolfEntity): boolean =>
      RANK[access(entity)] >= RANK[action];
    return { role, setRole, access, can, canWrite: (e) => can("write", e) };
  }, [role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGolfRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGolfRole ต้องใช้ภายใน <GolfRoleProvider>");
  return ctx;
}
