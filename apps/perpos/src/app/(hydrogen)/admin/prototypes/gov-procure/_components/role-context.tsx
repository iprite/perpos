"use client";

// role-context.tsx — จำลอง role ปัจจุบัน (4 role, spec §1) สำหรับ prototype gov_procure
// คุมการซ่อน/disable ปุ่ม + field-level lock การเงิน (staff) ตาม role ที่ผู้พรีเซนเลือก
// prototype = UI lens · production = hard-enforce ที่ API (spec §1 หมายเหตุ Q4)
// import: import { GovProcureRoleProvider, useRole } from "../_components/role-context";

import React, { createContext, useContext, useMemo, useState } from "react";
import { GOV_PROCURE_ROLES, type ModuleRole } from "../_fixtures/types";

export const ROLE_LABEL: Record<ModuleRole, string> = Object.fromEntries(
  GOV_PROCURE_ROLES.map((r) => [r.key, r.label]),
) as Record<ModuleRole, string>;

export const ROLE_ORDER: ModuleRole[] = GOV_PROCURE_ROLES.map((r) => r.key);

const CAN_WRITE: Record<ModuleRole, boolean> = Object.fromEntries(
  GOV_PROCURE_ROLES.map((r) => [r.key, r.canWrite]),
) as Record<ModuleRole, boolean>;

interface RoleCtx {
  role: ModuleRole;
  setRole: (r: ModuleRole) => void;
  /** เขียน order ได้ไหม (owner/manager/staff = ได้ · viewer = อ่านอย่างเดียว) */
  canWrite: boolean;
  /** แก้ field การเงินได้ไหม — staff แก้ไม่ได้ (spec §1: field-level lock) */
  canEditFinance: boolean;
  /** viewer = อ่านอย่างเดียวทั้ง module (แสดง banner/badge โหมดดูอย่างเดียว) */
  isViewer: boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function GovProcureRoleProvider({
  children,
  defaultRole = "manager",
}: {
  children: React.ReactNode;
  defaultRole?: ModuleRole;
}) {
  const [role, setRole] = useState<ModuleRole>(defaultRole);

  const value = useMemo<RoleCtx>(
    () => ({
      role,
      setRole,
      canWrite: CAN_WRITE[role],
      canEditFinance: role === "owner" || role === "manager",
      isViewer: role === "viewer",
    }),
    [role],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useRole ต้องใช้ภายใน <GovProcureRoleProvider>");
  }
  return ctx;
}
