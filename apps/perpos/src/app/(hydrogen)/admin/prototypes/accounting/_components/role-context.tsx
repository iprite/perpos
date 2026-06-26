"use client";

// role-context.tsx — จำลอง role ปัจจุบัน + role matrix §4 (V/W/A) สำหรับ prototype accounting
// คุมการซ่อน/disable ปุ่ม + กรองเมนู ตาม role ที่ผู้พรีเซนเลือก — โชว์ว่าระบบคุมสิทธิ์ได้จริง
// import: import { AccountingRoleProvider, useAccountingRole } from "../_components/role-context";

import React, { createContext, useContext, useMemo, useState } from "react";

/** 4 role ตาม contract §4 (entry แรก = สิทธิ์สูงสุด) */
export type AccRole = "owner" | "accountant" | "staff" | "viewer";

// V = ดู · W = เพิ่ม/แก้ · A = write + admin-action (ปิดงวด/settings)
export type Access = "none" | "view" | "write" | "approve";

/**
 * entity key (จับคู่กับแถวใน role matrix §4)
 * หน้าบ้าน A1-A6: dashboard / entries / documents / contacts / products / tax_my
 * หลังบ้าน B1-B6: journal / accounts / reports / tax_closing / assets / settings
 */
export type Entity =
  | "dashboard"
  | "entries"
  | "documents"
  | "contacts"
  | "products"
  | "tax_my"
  | "journal"
  | "accounts"
  | "reports"
  | "tax_closing"
  | "assets"
  | "settings";

// ลำดับสิทธิ์ (มาก→น้อย) — approve ครอบ write ครอบ view
const RANK: Record<Access, number> = { none: 0, view: 1, write: 2, approve: 3 };

// role matrix §4 — เก็บระดับสูงสุดต่อ (role × entity)
// owner = ดู+คุม settings (หลังบ้านส่วนใหญ่ = view) · accountant = เครื่องมือเต็ม + ปิดงวด
// staff = หน้าบ้านเขียนได้ (หลังบ้านไม่เห็น) · viewer = อ่านทุกอย่าง
const MATRIX: Record<AccRole, Record<Entity, Access>> = {
  owner: {
    dashboard: "view",
    entries: "write",
    documents: "write",
    contacts: "write",
    products: "write",
    tax_my: "view",
    journal: "view",
    accounts: "view",
    reports: "view",
    tax_closing: "view",
    assets: "view",
    settings: "approve", // settings PUT = owner เท่านั้น (VAT toggle)
  },
  accountant: {
    dashboard: "view",
    entries: "write",
    documents: "write",
    contacts: "write",
    products: "write",
    tax_my: "view",
    journal: "write",
    accounts: "write",
    reports: "view",
    tax_closing: "approve", // ปิดงวด = accountant
    assets: "write",
    settings: "view",
  },
  staff: {
    dashboard: "view",
    entries: "write",
    documents: "write",
    contacts: "write",
    products: "write",
    tax_my: "view",
    journal: "none",
    accounts: "none",
    reports: "none",
    tax_closing: "none",
    assets: "none",
    settings: "none",
  },
  viewer: {
    dashboard: "view",
    entries: "view",
    documents: "view",
    contacts: "view",
    products: "view",
    tax_my: "view",
    journal: "view",
    accounts: "view",
    reports: "view",
    tax_closing: "view",
    assets: "view",
    settings: "view",
  },
};

export const ROLE_LABEL: Record<AccRole, string> = {
  owner: "เจ้าของ",
  accountant: "นักบัญชี",
  staff: "พนักงาน",
  viewer: "ผู้ดูข้อมูล",
};

export const ROLE_ORDER: AccRole[] = ["owner", "accountant", "staff", "viewer"];

type Action = "view" | "write" | "approve";

interface RoleCtx {
  role: AccRole;
  setRole: (r: AccRole) => void;
  /** ระดับสิทธิ์ของ role ปัจจุบันต่อ entity */
  access: (entity: Entity) => Access;
  /** ทำ action นี้กับ entity นี้ได้ไหม (เทียบ rank) */
  can: (action: Action, entity: Entity) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);

export function AccountingRoleProvider({
  children,
  defaultRole = "owner",
}: {
  children: React.ReactNode;
  defaultRole?: AccRole;
}) {
  const [role, setRole] = useState<AccRole>(defaultRole);

  const value = useMemo<RoleCtx>(() => {
    const access = (entity: Entity): Access => MATRIX[role][entity];
    const can = (action: Action, entity: Entity): boolean => RANK[access(entity)] >= RANK[action];
    return { role, setRole, access, can };
  }, [role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccountingRole(): RoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAccountingRole ต้องใช้ภายใน <AccountingRoleProvider>");
  }
  return ctx;
}
