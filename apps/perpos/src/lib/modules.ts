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
  /** personal = true → user-level module (personal grant + LINE required).
   *  Hidden from org module switchers — accessed via header icon instead. */
  personal?: boolean;
  /**
   * forOrgSlugs — slugs ขององค์กรที่ได้รับอนุญาตให้เปิด specific module นี้
   * ถ้าไม่ระบุ: admin เปิดให้ org ไหนก็ได้ (ท่า tmc เดิม)
   * ถ้าระบุ: module จะโชว์ใน Admin → Modules เฉพาะ org เหล่านี้
   */
  forOrgSlugs?: string[];
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
    // key ภายในยังเป็น 'stt' (เลี่ยง FK rename) — user-facing = "ผู้ช่วย AI"
    key: "stt",
    label: "ผู้ช่วย AI",
    href: "/assistant",
    personal: true,
    // ผู้ช่วย AI ส่วนตัว (per-profile) — top-level /assistant ไม่มี org
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg[0] === "assistant";
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
    forOrgSlugs: ["jtacc"],
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
  {
    key: "just_me",
    label: "Just Me",
    href: "/just-me",
    specific: true,
    forOrgSlugs: ["justme"],
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "just-me";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
  {
    key: "usvilla",
    label: "PMS",
    href: "/usvilla",
    specific: true,
    forOrgSlugs: ["usvilla"],
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "usvilla";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
  {
    key: "jaquar",
    label: "Jaquar",
    href: "/jaquar",
    specific: true,
    forOrgSlugs: ["p2psupply"],
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "jaquar";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
  {
    key: "b2g",
    label: "B2G",
    href: "/b2g",
    specific: true,
    forOrgSlugs: ["p2p-x-89"],
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "b2g";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
  {
    key: "p2p_supply",
    label: "P2P Supply",
    href: "/p2p-supply",
    specific: true,
    forOrgSlugs: ["p2psupply"],
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "p2p-supply";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
  {
    key: "p2p_group",
    label: "P2P Group",
    href: "/p2p-group",
    specific: true,
    forOrgSlugs: ["p2pholding"],
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "p2p-group";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
  {
    key: "hrm",
    label: "HR",
    href: "/hrm",
    specific: true,
    
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "hrm";
    },
    roles: [
      { key: "owner",   label: "Owner",   canWrite: true  },
      { key: "manager", label: "Manager", canWrite: true  },
      { key: "viewer",  label: "Viewer",  canWrite: false },
    ],
  },
];

export const ALL_MODULE_KEYS = ALL_MODULES.map((m) => m.key);

export type MenuSubItemDef = { key: string; label: string };
export type MenuDef = { key: string; label: string; items?: MenuSubItemDef[] };

export const MODULE_MENUS: Record<string, MenuDef[]> = {
  accounting: [
    { key: "reports", label: "รายงาน", items: [
      { key: "dashboard",       label: "แดชบอร์ดผู้บริหาร" },
      { key: "reports",         label: "รายงานการเงิน" },
      { key: "tax-and-closing", label: "ภาษี & ปิดงบ" },
    ]},
    { key: "sales", label: "ขาย", items: [
      { key: "quotations",        label: "ใบเสนอราคา" },
      { key: "received-deposits", label: "ใบรับมัดจำ" },
      { key: "invoices",          label: "ใบแจ้งหนี้" },
      { key: "receipts",          label: "ใบเสร็จรับเงิน" },
      { key: "tax-invoices",      label: "ใบกำกับภาษีขาย" },
      { key: "etax-invoices",     label: "e-Tax Invoice" },
      { key: "credit-notes",      label: "ใบลดหนี้" },
      { key: "debit-notes",       label: "ใบเพิ่มหนี้" },
      { key: "billing-notes",     label: "ใบวางบิล" },
    ]},
    { key: "purchase", label: "ซื้อ", items: [
      { key: "purchase-orders",       label: "ใบสั่งซื้อ" },
      { key: "paid-deposits",         label: "ใบจ่ายมัดจำ" },
      { key: "expenses",              label: "บันทึกค่าใช้จ่าย" },
      { key: "wht-expenses",          label: "บันทึกรายจ่ายที่มีภาษีหัก ณ ที่จ่าย" },
      { key: "purchase-tax-invoices", label: "ใบกำกับภาษีซื้อ" },
      { key: "payment-summaries",     label: "ใบรวมจ่าย" },
      { key: "received-credit-notes", label: "รับใบลดหนี้" },
      { key: "received-debit-notes",  label: "รับใบเพิ่มหนี้" },
      { key: "goods-receipts",        label: "รับสินค้า" },
    ]},
    { key: "finance", label: "การเงิน", items: [
      { key: "petty-cash-accounts", label: "เงินสดย่อย" },
      { key: "bank-accounts",       label: "บัญชีธนาคาร" },
      { key: "payment-channels",    label: "ช่องทางรับเงิน" },
      { key: "reserve-accounts",    label: "บัญชีสำรอง" },
      { key: "check-deposits",      label: "เช็ครับ" },
      { key: "check-payments",      label: "เช็คจ่าย" },
      { key: "wht-received",        label: "ภาษีถูกหัก ณ ที่จ่าย" },
      { key: "wht-paid",            label: "ภาษีหัก ณ ที่จ่าย" },
    ]},
    { key: "bookkeeping", label: "บัญชี", items: [
      { key: "journal",           label: "สมุดรายวัน" },
      { key: "accounts",          label: "ผังบัญชี" },
      { key: "ledger",            label: "บัญชีแยกประเภท" },
      { key: "balance-sheet",     label: "งบดุล" },
      { key: "trial-balance",     label: "งบทดลอง" },
      { key: "financial-position",label: "งบฐานะการเงิน" },
      { key: "income-statement",  label: "งบกำไรขาดทุน" },
      { key: "cash-flow",         label: "งบกระแสเงินสด" },
    ]},
    { key: "assets", label: "สินทรัพย์", items: [
      { key: "assets-register",  label: "ทะเบียนสินทรัพย์" },
      { key: "goods-receipts",   label: "ซื้อสินทรัพย์" },
      { key: "assets-disposals", label: "ขายสินทรัพย์" },
    ]},
    { key: "vat", label: "ภาษีมูลค่าเพิ่ม", items: [
      { key: "vat-sales",     label: "รายการภาษีขาย" },
      { key: "vat-purchases", label: "รายการภาษีซื้อ" },
      { key: "pp30",          label: "แบบ ภ.พ.30" },
    ]},
    { key: "wht", label: "ภาษีหัก ณ ที่จ่าย", items: [
      { key: "wht-certificates", label: "ใบหัก ณ ที่จ่าย" },
      { key: "pnd1",             label: "แบบ ภ.ง.ด.1" },
      { key: "pnd2",             label: "แบบ ภ.ง.ด.2" },
      { key: "pnd3",             label: "แบบ ภ.ง.ด.3" },
      { key: "pnd53",            label: "แบบ ภ.ง.ด.53" },
    ]},
    { key: "contacts", label: "ผู้ติดต่อ", items: [
      { key: "customers", label: "ลูกค้า" },
      { key: "vendors",   label: "ผู้ขาย" },
    ]},
    { key: "inventory", label: "สินค้า", items: [
      { key: "products",     label: "สินค้า/บริการ" },
      { key: "units",        label: "หน่วย" },
      { key: "inventory",    label: "สินค้า/สต๊อก" },
      { key: "requisitions", label: "ใบเบิกสินค้า" },
      { key: "returns",      label: "ใบส่งคืนเบิกสินค้า" },
    ]},
    { key: "settings", label: "ตั้งค่า", items: [
      { key: "accounting-users", label: "ผู้ใช้งาน" },
      { key: "roles",            label: "สิทธิ์การใช้งาน" },
      { key: "wht-documents",    label: "WHT + เอกสาร" },
      { key: "reconciliation",   label: "กระทบยอดธนาคาร" },
      { key: "audit-logs",       label: "Audit Logs" },
      { key: "setting",          label: "ตั้งค่าองค์กร" },
    ]},
  ],
  payroll: [
    { key: "reports",     label: "รายงาน" },
    { key: "salary",      label: "เงินเดือน" },
    { key: "employees",   label: "พนักงาน" },
    { key: "departments", label: "แผนก" },
    { key: "pay-items",   label: "เงินเพิ่ม/เงินหัก" },
    { key: "settings", label: "ตั้งค่า", items: [
      { key: "funds",               label: "ข้อมูลกองทุน" },
      { key: "accounting-settings", label: "ตั้งค่าการบันทึกบัญชี" },
    ]},
  ],
  stt: [
    { key: "transcribe", label: "ถอดเสียง" },
    { key: "usage",      label: "การใช้งาน" },
    { key: "billing",    label: "การชำระเงิน" },
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
    { key: "dashboard",       label: "Dashboard" },
    { key: "clients",         label: "ลูกค้า (Client Orgs)" },
    { key: "reports",         label: "รายงานรวม" },
    { key: "petty-cash",      label: "เงินสดย่อย" },
    { key: "service-clients", label: "ลูกค้าบริการ" },
  ],
  just_me: [
    { key: "dashboard",    label: "Dashboard" },
    { key: "clock_in_out", label: "Clock In/Out" },
    { key: "inventory",    label: "Inventory" },
  ],
  usvilla: [
    { key: "dashboard", label: "Dashboard" },
  ],
  jaquar: [
    { key: "dashboard", label: "Dashboard" },
    { key: "stock", label: "คลังสินค้า (Stock)" },
  ],
  b2g: [
    { key: "dashboard", label: "Dashboard" },
  ],
  p2p_supply: [
    { key: "dashboard", label: "Dashboard" },
  ],
  p2p_group: [
    { key: "dashboard", label: "Dashboard" },
  ],
  hrm: [
    { key: "dashboard", label: "Dashboard" },
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
