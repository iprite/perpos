/** A single role available inside a module */
export type ModuleRoleDef = {
  key: string;
  label: string;
  /** If true this role can create/edit/delete records in the module */
  canWrite: boolean;
};

export type ModuleDef = {
  key: string;
  label: string;
  href: string;
  /** specific = true → module built exclusively for one particular org
   *  (e.g. TMC Management). Hidden from other orgs' module manager entirely. */
  specific?: boolean;
  match: (pathname: string) => boolean;
  /** Role definitions available inside this module.
   *  First entry is considered the highest-privilege role. */
  roles: ModuleRoleDef[];
};

// All hrefs are relative to /:orgSlug — callers prefix with `/${orgSlug}`.
// match() receives the full pathname (e.g. "/p2p/accounting/invoices").
export const ALL_MODULES: ModuleDef[] = [
  {
    key: "accounting",
    label: "Accounting",
    href: "/accounting",
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "accounting";
    },
    roles: [
      { key: "owner",       label: "Owner",      canWrite: true  },
      { key: "accountant",  label: "Accountant", canWrite: true  },
      { key: "viewer",      label: "Viewer",     canWrite: false },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/payroll",
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "payroll";
    },
    roles: [
      { key: "owner",      label: "Owner",      canWrite: true  },
      { key: "hr_manager", label: "HR Manager", canWrite: true  },
      { key: "hr_staff",   label: "HR Staff",   canWrite: true  },
      { key: "viewer",     label: "Viewer",     canWrite: false },
    ],
  },
  {
    key: "assistant",
    label: "Assistant",
    href: "/assistant",
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "assistant";
    },
    roles: [
      { key: "owner",  label: "Owner",  canWrite: true },
      { key: "member", label: "Member", canWrite: true },
    ],
  },
  {
    key: "tmc",
    label: "TMC Management",
    href: "/tmc",
    specific: true,
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "tmc";
    },
    roles: [
      { key: "owner",       label: "Owner",       canWrite: true  },
      { key: "admin",       label: "Admin",        canWrite: true  },
      { key: "team_lead",   label: "Team Lead",    canWrite: true  },
      { key: "team_member", label: "Team Member",  canWrite: false },
    ],
  },
  {
    key: "crm",
    label: "CRM & Solutions",
    href: "/crm",
    specific: true,
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "crm";
    },
    roles: [
      { key: "owner",       label: "Owner",       canWrite: true  },
      { key: "manager",     label: "Manager",     canWrite: true  },
      { key: "member",      label: "Member",      canWrite: true  },
      { key: "viewer",      label: "Viewer",      canWrite: false },
    ],
  },
  {
    key: "acc_firm",
    label: "สำนักงานบัญชี",
    href: "/acc-firm",
    specific: true,
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "acc-firm";
    },
    roles: [
      { key: "owner",       label: "Owner",       canWrite: true  },
      { key: "accountant",  label: "Accountant",  canWrite: true  },
      { key: "viewer",      label: "Viewer",      canWrite: false },
    ],
  },
];

export const ALL_MODULE_KEYS = ALL_MODULES.map((m) => m.key);

export type MenuDef = { key: string; label: string };

export const MODULE_MENUS: Record<string, MenuDef[]> = {
  accounting: [
    { key: "reports",     label: "รายงาน" },
    { key: "sales",       label: "ขาย" },
    { key: "purchase",    label: "ซื้อ" },
    { key: "finance",     label: "การเงิน" },
    { key: "bookkeeping", label: "บัญชี" },
    { key: "assets",      label: "สินทรัพย์" },
    { key: "vat",         label: "ภาษีมูลค่าเพิ่ม" },
    { key: "wht",         label: "ภาษีหัก ณ ที่จ่าย" },
    { key: "contacts",    label: "ผู้ติดต่อ" },
    { key: "inventory",   label: "สินค้า" },
    { key: "settings",    label: "ตั้งค่า" },
  ],
  payroll: [
    { key: "reports",     label: "รายงาน" },
    { key: "salary",      label: "เงินเดือน" },
    { key: "employees",   label: "พนักงาน" },
    { key: "departments", label: "แผนก" },
    { key: "pay-items",   label: "เงินเพิ่ม/เงินหัก" },
    { key: "settings",    label: "ตั้งค่า" },
  ],
  assistant: [
    { key: "tasks", label: "Task Manager" },
  ],
  tmc: [
    { key: "dashboard",  label: "Dashboard" },
    { key: "finance",    label: "บัญชีและการเงิน" },
    { key: "petty-cash", label: "เงินสดย่อย" },
    { key: "stock",      label: "Stock คลัง" },
    { key: "stays",      label: "การเข้าพัก" },
  ],
  crm: [
    { key: "dashboard",  label: "Dashboard" },
    { key: "clients",    label: "ลูกค้า" },
    { key: "solutions",  label: "Solutions" },
  ],
  acc_firm: [
    { key: "dashboard", label: "Dashboard" },
    { key: "clients",   label: "ลูกค้า (Client Orgs)" },
  ],
};

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.key, m.label]),
);

/** Map of module_key → its role definitions */
export const MODULE_ROLES: Record<string, ModuleRoleDef[]> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.key, m.roles]),
);

/** Returns the role defs for a module, or [] if unknown */
export function getModuleRoles(moduleKey: string): ModuleRoleDef[] {
  return MODULE_ROLES[moduleKey] ?? [];
}

/** True if the given module role is allowed to write */
export function canModuleWrite(moduleKey: string, moduleRole: string): boolean {
  const def = getModuleRoles(moduleKey).find((r) => r.key === moduleRole);
  return def?.canWrite ?? false;
}

export const ORG_ROLES = ["owner", "admin", "team_lead", "team_member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
