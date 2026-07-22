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
    label: "บัญชี & การเงิน",
    href: "/accounting",
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "accounting";
    },
    // owner = เจ้าของ (ดู+คุมระบบ/settings), accountant = นักบัญชี (เครื่องมือหลังบ้านเต็ม+ปิดงวด),
    // staff = พนักงาน (เขียนได้เฉพาะหน้าบ้าน), viewer = ดูอย่างเดียว (role matrix §4 contract)
    roles: [
      { key: "owner", label: "เจ้าของ", canWrite: true },
      { key: "accountant", label: "นักบัญชี", canWrite: true },
      { key: "staff", label: "พนักงาน", canWrite: true },
      { key: "viewer", label: "ผู้ดูข้อมูล", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "admin", label: "Admin", canWrite: true },
      { key: "team_lead", label: "Team Lead", canWrite: true },
      { key: "team_member", label: "Team Member", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "member", label: "Member", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "accountant", label: "Accountant", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
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
    // owner = เจ้าของ/ผู้ดูแล (อนุมัติจ่ายเงินเดือน), hr = ฝ่ายบุคคล (จัดการ/อนุมัติลา),
    // viewer = ดูอย่างเดียว · ยุบจาก payroll 4 ระดับ (owner/hr_manager/hr_staff/viewer)
    roles: [
      { key: "owner", label: "เจ้าของ/ผู้ดูแล", canWrite: true },
      { key: "hr", label: "ฝ่ายบุคคล", canWrite: true },
      { key: "viewer", label: "ผู้ดูข้อมูล", canWrite: false },
    ],
  },
  {
    key: "gov_procure",
    label: "จัดซื้อครุภัณฑ์ภาครัฐ",
    href: "/gov-procure",
    specific: true,
    forOrgSlugs: ["p2p-x-89"],
    match: (p) => {
      const seg = p.split("/").filter(Boolean);
      return seg.length >= 2 && seg[1] === "gov-procure";
    },
    // owner/manager แก้ได้ทุก field · staff เขียนได้เฉพาะ milestone/stage/attachment (field การเงิน
    // ล็อกที่ API allowlist ต่อ role ตาม Q4 — ไม่ใช่แค่ canWrite ระดับ module) · viewer read-only
    roles: [
      { key: "owner", label: "Owner", canWrite: true },
      { key: "manager", label: "Manager", canWrite: true },
      { key: "staff", label: "Staff", canWrite: true },
      { key: "viewer", label: "Viewer", canWrite: false },
    ],
  },
];

export const ALL_MODULE_KEYS = ALL_MODULES.map((m) => m.key);

export type MenuSubItemDef = { key: string; label: string };
export type MenuDef = { key: string; label: string; items?: MenuSubItemDef[] };

export const MODULE_MENUS: Record<string, MenuDef[]> = {
  // รื้อใหม่ (contract v4) — 2 กลุ่มกระชับ (แทน 11 กลุ่มยักษ์เดิม, R4 anti-over-scope).
  // menu key = route segment ใต้ /[orgSlug]/accounting/ (dashboard = หน้า index "/").
  // nav lens (owner เห็นหน้าบ้าน, opt-in หลังบ้าน) = enforce ที่ menu-builder/page guard ไม่ใช่ใน MODULE_MENUS.
  accounting: [
    {
      key: "frontstage",
      label: "หน้าบ้าน",
      items: [
        { key: "dashboard", label: "ภาพรวม" },
        { key: "entries", label: "รายรับ-รายจ่าย" },
        { key: "documents", label: "เอกสารขาย" },
        { key: "contacts", label: "ลูกค้า/ผู้ขาย" },
        { key: "products", label: "สินค้าและบริการ" },
        { key: "tax", label: "ภาษีของฉัน" },
      ],
    },
    {
      key: "backstage",
      label: "หลังบ้าน",
      items: [
        { key: "purchase_documents", label: "ใบกำกับภาษีซื้อ" },
        { key: "journal", label: "สมุดรายวัน" },
        { key: "accounts", label: "ผังบัญชี" },
        { key: "reports", label: "รายงานการเงิน" },
        { key: "tax-closing", label: "ภาษี & ปิดงวด" },
        { key: "assets", label: "สินทรัพย์ & ค่าเสื่อม" },
        { key: "settings", label: "ตั้งค่า" },
      ],
    },
  ],
  stt: [
    { key: "transcribe", label: "ถอดเสียง" },
    { key: "usage", label: "การใช้งาน" },
    { key: "billing", label: "การชำระเงิน" },
  ],
  tmc: [
    { key: "dashboard", label: "Dashboard" },
    { key: "finance", label: "บัญชีและการเงิน" },
    { key: "petty-cash", label: "เงินสดย่อย" },
    { key: "stock", label: "Stock คลัง" },
    { key: "stays", label: "การเข้าพัก" },
  ],
  crm: [
    { key: "dashboard", label: "Dashboard" },
    { key: "clients", label: "ลูกค้า" },
    { key: "solutions", label: "Solutions" },
  ],
  acc_firm: [
    { key: "dashboard", label: "Dashboard" },
    { key: "clients", label: "ลูกค้า (Client Orgs)" },
    { key: "reports", label: "รายงานรวม" },
    { key: "close-check", label: "ตรวจปิดงวด" },
    { key: "petty-cash", label: "เงินสดย่อย" },
    { key: "service-clients", label: "ลูกค้าบริการ" },
  ],
  just_me: [
    { key: "dashboard", label: "Dashboard" },
    { key: "clock_in_out", label: "Clock In/Out" },
    { key: "inventory", label: "Inventory" },
  ],
  usvilla: [{ key: "dashboard", label: "Dashboard" }],
  jaquar: [
    { key: "dashboard", label: "Dashboard" },
    { key: "stock", label: "คลังสินค้า (Stock)" },
  ],
  b2g: [{ key: "dashboard", label: "Dashboard" }],
  p2p_supply: [{ key: "dashboard", label: "Dashboard" }],
  p2p_group: [{ key: "dashboard", label: "Dashboard" }],
  hrm: [
    { key: "dashboard", label: "ภาพรวม" },
    { key: "employees", label: "พนักงาน" },
    { key: "payroll", label: "เงินเดือน" },
    { key: "leave", label: "การลา" },
    { key: "time", label: "เวลาทำงาน" },
    { key: "settings", label: "ตั้งค่า" },
  ],
  gov_procure: [
    { key: "dashboard", label: "แดชบอร์ด" },
    { key: "pipeline", label: "ไปป์ไลน์" },
    { key: "orders", label: "รายการงาน" },
    { key: "receivables", label: "เงินค้างรับ" },
    { key: "reports", label: "รายงาน" },
    { key: "capital", label: "กองทุน" },
    { key: "investors", label: "นักลงทุน" },
    { key: "settings", label: "ตั้งค่า/แจ้งเตือน" },
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
