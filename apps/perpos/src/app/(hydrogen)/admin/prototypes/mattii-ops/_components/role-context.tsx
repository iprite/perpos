"use client";

// role-context.tsx — จำลอง role ปัจจุบัน + matrix สิทธิ์ (Contract v3 §2.2) ของ prototype mattii_ops
// สลับ role → nav + สิ่งที่เห็นในหน้าเปลี่ยนจริง (โชว์ว่าระบบคุมสิทธิ์ได้)
// import: import { useMattiiRole } from "../_components";

import React, { createContext, useContext, useMemo, useState } from "react";
import { STAFF_ROLE_LABEL } from "../_fixtures/labels";
import type { StaffRole } from "../_fixtures/types";

export type MattiiRole = StaffRole;

/** V = ดู · W = เพิ่ม/แก้ · A = เปลี่ยนสถานะ/อนุมัติ */
export type Access = "none" | "view" | "write" | "approve";

/** entity key (จับคู่กับแถวใน matrix §2.2) */
export type Entity =
  | "dashboard"
  | "inbox"
  | "orders"
  | "design"
  | "production"
  | "qc"
  | "shipments"
  | "payments"
  | "customers"
  | "products"
  | "materials"
  | "stock"
  | "reports"
  | "settings"
  | "staff";

const RANK: Record<Access, number> = { none: 0, view: 1, write: 2, approve: 3 };

// matrix §2.2 — ระดับสูงสุดต่อ (role × entity)
const MATRIX: Record<MattiiRole, Record<Entity, Access>> = {
  owner: {
    dashboard: "view",
    inbox: "view",
    orders: "approve",
    design: "approve",
    production: "approve",
    qc: "view",
    shipments: "approve",
    payments: "approve",
    customers: "write",
    products: "write",
    materials: "write",
    stock: "approve",
    reports: "view",
    settings: "approve",
    staff: "write",
  },
  sale: {
    dashboard: "view",
    inbox: "approve",
    orders: "approve",
    design: "approve",
    production: "view",
    qc: "view",
    shipments: "view",
    payments: "approve",
    customers: "write",
    products: "view",
    materials: "none",
    stock: "none",
    reports: "view",
    settings: "view",
    staff: "none",
  },
  designer: {
    dashboard: "view",
    inbox: "none",
    orders: "view",
    design: "approve",
    production: "view",
    qc: "none",
    shipments: "none",
    payments: "none",
    customers: "view",
    products: "view",
    materials: "none",
    stock: "none",
    reports: "view",
    settings: "none",
    staff: "none",
  },
  production: {
    dashboard: "view",
    inbox: "none",
    orders: "view",
    design: "view",
    production: "approve",
    qc: "approve",
    shipments: "approve",
    payments: "view",
    customers: "view",
    products: "view",
    materials: "write",
    stock: "write",
    reports: "view",
    settings: "view",
    staff: "none",
  },
};

export const ROLE_LABEL: Record<MattiiRole, string> = STAFF_ROLE_LABEL;
export const ROLE_ORDER: MattiiRole[] = ["owner", "sale", "designer", "production"];

type Action = "view" | "write" | "approve";

interface RoleCtx {
  role: MattiiRole;
  setRole: (r: MattiiRole) => void;
  access: (entity: Entity) => Access;
  can: (action: Action, entity: Entity) => boolean;
  /** 🔒 owner-only surface (ต้นทุน/กำไร/มูลค่าสต๊อก/ค่าแรง) — ซ่อนทั้งก้อน ไม่ใช่ disable */
  isOwner: boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function MattiiRoleProvider({
  children,
  defaultRole = "owner",
}: {
  children: React.ReactNode;
  defaultRole?: MattiiRole;
}) {
  const [role, setRole] = useState<MattiiRole>(defaultRole);

  const value = useMemo<RoleCtx>(() => {
    const access = (entity: Entity): Access => MATRIX[role][entity];
    const can = (action: Action, entity: Entity): boolean => RANK[access(entity)] >= RANK[action];
    return { role, setRole, access, can, isOwner: role === "owner" };
  }, [role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMattiiRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMattiiRole ต้องใช้ภายใน <MattiiRoleProvider>");
  return ctx;
}
