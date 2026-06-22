"use client";

// role-context.tsx — จำลอง role ปัจจุบัน + matrix §4 (V/W/A) สำหรับ prototype
// ใช้คุมการซ่อน/disable ปุ่มตาม role ที่ผู้พรีเซนเลือก — โชว์ว่าระบบคุมสิทธิ์ได้จริง
// import: import { NursingRoleProvider, useNursingRole } from "../_components/role-context";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { ModuleRole } from "../_fixtures/types";

// ─── สิทธิ์ระดับ entity ตาม spec §4 matrix ───
// V = ดู · W = เพิ่ม/แก้ · A = อนุมัติ/ปิด/ยืนยันสถานะ
export type Access = "none" | "view" | "write" | "approve";

/** entity key (จับคู่กับแถวใน matrix §4) */
export type Entity =
  | "dashboard"
  | "residents"
  | "rooms"
  | "family_contacts"
  | "visits"
  | "medical_histories"
  | "vital_signs"
  | "care_plans"
  | "medication_orders"
  | "medication_administrations"
  | "daily_care_logs"
  | "incident_reports"
  | "staff"
  | "shifts"
  | "care_assignments"
  | "shift_checkins"
  | "service_packages"
  | "invoices"
  | "payments"
  | "reports";

// ลำดับสิทธิ์ (มาก→น้อย) — approve ครอบ write ครอบ view
const RANK: Record<Access, number> = { none: 0, view: 1, write: 2, approve: 3 };

// matrix §4 — เก็บระดับสูงสุดต่อ (role × entity)
const MATRIX: Record<ModuleRole, Record<Entity, Access>> = {
  owner: {
    dashboard: "view",
    residents: "approve",
    rooms: "write",
    family_contacts: "write",
    visits: "write",
    medical_histories: "write",
    vital_signs: "view",
    care_plans: "approve",
    medication_orders: "view",
    medication_administrations: "view",
    daily_care_logs: "view",
    incident_reports: "approve",
    staff: "write",
    shifts: "approve",
    care_assignments: "write",
    shift_checkins: "view",
    service_packages: "write",
    invoices: "approve",
    payments: "approve",
    reports: "view",
  },
  nurse: {
    dashboard: "view",
    residents: "view",
    rooms: "view",
    family_contacts: "view",
    visits: "write",
    medical_histories: "write",
    vital_signs: "write",
    care_plans: "approve",
    medication_orders: "approve",
    medication_administrations: "write",
    daily_care_logs: "write",
    incident_reports: "approve",
    staff: "view",
    shifts: "view",
    care_assignments: "write",
    shift_checkins: "write",
    service_packages: "none",
    invoices: "none",
    payments: "none",
    reports: "view",
  },
  caregiver: {
    dashboard: "view",
    residents: "view",
    rooms: "view",
    family_contacts: "view",
    visits: "write",
    medical_histories: "view",
    vital_signs: "write",
    care_plans: "view",
    medication_orders: "view",
    medication_administrations: "write",
    daily_care_logs: "write",
    incident_reports: "write",
    staff: "view",
    shifts: "view",
    care_assignments: "view",
    shift_checkins: "write",
    service_packages: "none",
    invoices: "none",
    payments: "none",
    reports: "none",
  },
  admin_staff: {
    dashboard: "view",
    residents: "approve",
    rooms: "write",
    family_contacts: "write",
    visits: "write",
    medical_histories: "view",
    vital_signs: "view",
    care_plans: "view",
    medication_orders: "view",
    medication_administrations: "none",
    daily_care_logs: "view",
    incident_reports: "view",
    staff: "write",
    shifts: "approve",
    care_assignments: "write",
    shift_checkins: "view",
    service_packages: "write",
    invoices: "approve",
    payments: "approve",
    reports: "view",
  },
};

export const ROLE_LABEL: Record<ModuleRole, string> = {
  owner: "เจ้าของ/ผู้จัดการ",
  nurse: "พยาบาลวิชาชีพ",
  caregiver: "ผู้ช่วยดูแล",
  admin_staff: "ธุรการ/การเงิน",
};

export const ROLE_ORDER: ModuleRole[] = ["owner", "nurse", "caregiver", "admin_staff"];

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

export function NursingRoleProvider({
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

export function useNursingRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useNursingRole ต้องใช้ภายใน <NursingRoleProvider>");
  }
  return ctx;
}
