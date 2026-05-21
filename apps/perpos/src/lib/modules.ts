export type ModuleDef = {
  key: string;
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

export const ALL_MODULES: ModuleDef[] = [
  {
    key: "accounting",
    label: "Accounting",
    href: "/executive-dashboard",
    match: (p) =>
      !p.startsWith("/payroll") &&
      !p.startsWith("/admin") &&
      !p.startsWith("/assistant") &&
      !p.startsWith("/tmc"),
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/payroll/salary",
    match: (p) => p.startsWith("/payroll"),
  },
  {
    key: "assistant",
    label: "Assistant",
    href: "/assistant",
    match: (p) => p.startsWith("/assistant"),
  },
  {
    key: "tmc",
    label: "TMC Management",
    href: "/tmc/stays",
    match: (p) => p.startsWith("/tmc"),
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
};

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.key, m.label]),
);

export const ORG_ROLES = ["owner", "admin", "team_lead", "team_member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
