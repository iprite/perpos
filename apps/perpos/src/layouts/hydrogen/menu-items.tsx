import React from "react";
import {
  LayoutDashboard,
  Users,
  BookOpenText,
  ReceiptText,
  ShoppingCart,
  BarChart3,
  ShieldCheck,
  Wallet,
  Package,
  Contact,
  Building2,
  DollarSign,
  Landmark,
  FileText,
  Percent,
  LayoutGrid,
  PlusCircle,
  Activity,
  Webhook,
  ShieldBan,
  CreditCard,
  HeartPulse,
  TrendingUp,
  Briefcase,
  Kanban,
  Calculator,
  Clock,
  CalendarDays,
  Link2,
  ClipboardList,
  BedDouble,
  Navigation,
  Mic,
  ScrollText,
  Sparkles,
  Megaphone,
  Settings2,
  TimerReset,
  Server,
} from "lucide-react";

import type { Role } from "@/lib/supabase/types";

export type LabelMenuItem = { name: string; roles?: Role[] };

export type LinkMenuItem = {
  name: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
  roles?: Role[];
  dropdownItems?: {
    name: string;
    href: string;
    badge?: string;
    roles?: Role[];
  }[];
};

export type MenuItem = LabelMenuItem | LinkMenuItem;

export function isLinkMenuItem(item: MenuItem): item is LinkMenuItem {
  return (item as LinkMenuItem).href !== undefined;
}

const allRoles: Role[] = ["super_admin", "user"];

const SYSTEM_SEGMENTS = new Set(["admin", "user", "signin", "no-org", "no-module", "assistant"]);

function hasRole(itemRoles: Role[] | undefined, role: Role | null) {
  if (!itemRoles) return true;
  if (!role) return false;
  return itemRoles.includes(role);
}

// ─── Accounting module ──────────────────────────────────────────────────────
function buildUserMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l  = (key: string, fallback: string) => labels[key] || fallback;
  const ls = (menu: string, key: string, fallback: string) => labels[`${menu}.${key}`] || fallback;
  const a  = (path: string) => `/${org}/accounting/${path}`;
  const base = `/${org}/accounting`;
  return [
    { name: "Accounting", roles: allRoles },
    {
      name: l("reports", "รายงาน"),
      href: base,
      icon: <BarChart3 className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("reports", "dashboard",       "แดชบอร์ดผู้บริหาร"), href: base,                 roles: allRoles },
        { name: ls("reports", "reports",         "รายงานการเงิน"),     href: a("reports"),          roles: allRoles },
        { name: ls("reports", "tax-and-closing", "ภาษี & ปิดงบ"),      href: a("tax-and-closing"), roles: allRoles },
      ],
    },
    {
      name: l("sales", "ขาย"),
      href: a("quotations"),
      icon: <ReceiptText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("sales", "quotations",        "ใบเสนอราคา"),     href: a("quotations"),        roles: allRoles },
        { name: ls("sales", "received-deposits", "ใบรับมัดจำ"),     href: a("received-deposits"), roles: allRoles },
        { name: ls("sales", "invoices",          "ใบแจ้งหนี้"),     href: a("invoices"),          roles: allRoles },
        { name: ls("sales", "receipts",          "ใบเสร็จรับเงิน"), href: a("receipts"),          roles: allRoles },
        { name: ls("sales", "tax-invoices",      "ใบกำกับภาษีขาย"), href: a("tax-invoices"),      roles: allRoles },
        { name: ls("sales", "etax-invoices",     "e-Tax Invoice"),  href: a("etax-invoices"),     roles: allRoles },
        { name: ls("sales", "credit-notes",      "ใบลดหนี้"),       href: a("credit-notes"),      roles: allRoles },
        { name: ls("sales", "debit-notes",       "ใบเพิ่มหนี้"),    href: a("debit-notes"),       roles: allRoles },
        { name: ls("sales", "billing-notes",     "ใบวางบิล"),       href: a("billing-notes"),     roles: allRoles },
      ],
    },
    {
      name: l("purchase", "ซื้อ"),
      href: a("purchase-orders"),
      icon: <ShoppingCart className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("purchase", "purchase-orders",       "ใบสั่งซื้อ"),                           href: a("purchase-orders"),         roles: allRoles },
        { name: ls("purchase", "paid-deposits",         "ใบจ่ายมัดจำ"),                          href: a("paid-deposits"),            roles: allRoles },
        { name: ls("purchase", "expenses",              "บันทึกค่าใช้จ่าย"),                     href: a("expenses"),                 roles: allRoles },
        { name: ls("purchase", "wht-expenses",          "บันทึกรายจ่ายที่มีภาษีหัก ณ ที่จ่าย"), href: a("wht-expenses"),             roles: allRoles },
        { name: ls("purchase", "purchase-tax-invoices", "ใบกำกับภาษีซื้อ"),                      href: a("purchase-tax-invoices"),    roles: allRoles },
        { name: ls("purchase", "payment-summaries",     "ใบรวมจ่าย"),                            href: a("payment-summaries"),        roles: allRoles },
        { name: ls("purchase", "received-credit-notes", "รับใบลดหนี้"),                          href: a("received-credit-notes"),    roles: allRoles },
        { name: ls("purchase", "received-debit-notes",  "รับใบเพิ่มหนี้"),                       href: a("received-debit-notes"),     roles: allRoles },
        { name: ls("purchase", "goods-receipts",        "รับสินค้า"),                            href: a("goods-receipts"),           roles: allRoles },
      ],
    },
    {
      name: l("finance", "การเงิน"),
      href: a("bank-accounts"),
      icon: <Wallet className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("finance", "petty-cash-accounts", "เงินสดย่อย"),            href: a("petty-cash-accounts"), roles: allRoles },
        { name: ls("finance", "bank-accounts",       "บัญชีธนาคาร"),           href: a("bank-accounts"),       roles: allRoles },
        { name: ls("finance", "payment-channels",    "ช่องทางรับเงิน"),        href: a("payment-channels"),    roles: allRoles },
        { name: ls("finance", "reserve-accounts",    "บัญชีสำรอง"),            href: a("reserve-accounts"),    roles: allRoles },
        { name: ls("finance", "check-deposits",      "เช็ครับ"),               href: a("check-deposits"),      roles: allRoles },
        { name: ls("finance", "check-payments",      "เช็คจ่าย"),              href: a("check-payments"),      roles: allRoles },
        { name: ls("finance", "wht-received",        "ภาษีถูกหัก ณ ที่จ่าย"), href: a("wht-received"),        roles: allRoles },
        { name: ls("finance", "wht-paid",            "ภาษีหัก ณ ที่จ่าย"),    href: a("wht-paid"),            roles: allRoles },
      ],
    },
    {
      name: l("bookkeeping", "บัญชี"),
      href: a("journal"),
      icon: <BookOpenText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("bookkeeping", "journal",            "สมุดรายวัน"),     href: a("journal"),            roles: allRoles },
        { name: ls("bookkeeping", "accounts",           "ผังบัญชี"),       href: a("accounts"),           roles: allRoles },
        { name: ls("bookkeeping", "ledger",             "บัญชีแยกประเภท"), href: a("ledger"),             roles: allRoles },
        { name: ls("bookkeeping", "balance-sheet",      "งบดุล"),          href: a("balance-sheet"),      roles: allRoles },
        { name: ls("bookkeeping", "trial-balance",      "งบทดลอง"),        href: a("trial-balance"),      roles: allRoles },
        { name: ls("bookkeeping", "financial-position", "งบฐานะการเงิน"),  href: a("financial-position"), roles: allRoles },
        { name: ls("bookkeeping", "income-statement",   "งบกำไรขาดทุน"),   href: a("income-statement"),   roles: allRoles },
        { name: ls("bookkeeping", "cash-flow",          "งบกระแสเงินสด"),  href: a("cash-flow"),          roles: allRoles },
      ],
    },
    {
      name: l("assets", "สินทรัพย์"),
      href: a("assets-register"),
      icon: <Landmark className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("assets", "assets-register",  "ทะเบียนสินทรัพย์"), href: a("assets-register"),  roles: allRoles },
        { name: ls("assets", "goods-receipts",   "ซื้อสินทรัพย์"),    href: a("goods-receipts"),   roles: allRoles },
        { name: ls("assets", "assets-disposals", "ขายสินทรัพย์"),     href: a("assets-disposals"), roles: allRoles },
      ],
    },
    {
      name: l("vat", "ภาษีมูลค่าเพิ่ม"),
      href: a("pp30"),
      icon: <Percent className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("vat", "vat-sales",     "รายการภาษีขาย"),  href: a("vat-sales"),     roles: allRoles },
        { name: ls("vat", "vat-purchases", "รายการภาษีซื้อ"), href: a("vat-purchases"), roles: allRoles },
        { name: ls("vat", "pp30",          "แบบ ภ.พ.30"),     href: a("pp30"),          roles: allRoles },
      ],
    },
    {
      name: l("wht", "ภาษีหัก ณ ที่จ่าย"),
      href: a("wht-certificates"),
      icon: <FileText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("wht", "wht-certificates", "ใบหัก ณ ที่จ่าย"), href: a("wht-certificates"), roles: allRoles },
        { name: ls("wht", "pnd1",             "แบบ ภ.ง.ด.1"),     href: a("pnd/1"),            roles: allRoles },
        { name: ls("wht", "pnd2",             "แบบ ภ.ง.ด.2"),     href: a("pnd/2"),            roles: allRoles },
        { name: ls("wht", "pnd3",             "แบบ ภ.ง.ด.3"),     href: a("pnd/3"),            roles: allRoles },
        { name: ls("wht", "pnd53",            "แบบ ภ.ง.ด.53"),    href: a("pnd/53"),           roles: allRoles },
      ],
    },
    {
      name: l("contacts", "ผู้ติดต่อ"),
      href: a("customers"),
      icon: <Contact className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("contacts", "customers", "ลูกค้า"), href: a("customers"), roles: allRoles },
        { name: ls("contacts", "vendors",   "ผู้ขาย"), href: a("vendors"),   roles: allRoles },
      ],
    },
    {
      name: l("inventory", "สินค้า"),
      href: a("products"),
      icon: <Package className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("inventory", "products",     "สินค้า/บริการ"),       href: a("products"),     roles: allRoles },
        { name: ls("inventory", "units",        "หน่วย"),               href: a("units"),        roles: allRoles },
        { name: ls("inventory", "inventory",    "สินค้า/สต๊อก"),        href: a("inventory"),    roles: allRoles },
        { name: ls("inventory", "requisitions", "ใบเบิกสินค้า"),        href: a("requisitions"), roles: allRoles },
        { name: ls("inventory", "returns",      "ใบส่งคืนเบิกสินค้า"), href: a("returns"),      roles: allRoles },
      ],
    },
    {
      name: l("settings", "ตั้งค่า"),
      href: a("wht-documents"),
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("settings", "accounting-users", "ผู้ใช้งาน"),       href: a("accounting-users"), roles: allRoles },
        { name: ls("settings", "roles",            "สิทธิ์การใช้งาน"), href: a("roles"),            roles: allRoles },
        { name: ls("settings", "wht-documents",    "WHT + เอกสาร"),   href: a("wht-documents"),    roles: allRoles },
        { name: ls("settings", "reconciliation",   "กระทบยอดธนาคาร"), href: a("reconciliation"),   roles: allRoles },
        { name: ls("settings", "audit-logs",       "Audit Logs"),     href: a("audit-logs"),       roles: allRoles },
        { name: ls("settings", "setting",          "ตั้งค่าองค์กร"),  href: `/${org}/setting`,    roles: allRoles },
      ],
    },
  ];
}

// ─── Admin module ───────────────────────────────────────────────────────────
// จัดเป็น 4 หมวดด้วย section header (label ไม่มี href) — ทุกเมนูคลิกเดียวถึง
// ยกเว้น "แกะเสียง / MoM" ที่เป็น dropdown เพราะมี 3 หน้าย่อย
function buildAdminMenuItems(): MenuItem[] {
  return [
    // ── ภาพรวม ────────────────────────────────────────────────────────────────
    { name: "ภาพรวม", roles: ["super_admin"] },
    {
      name: "Dashboard",
      href: "/admin",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Tenant Health",
      href: "/admin/health",
      icon: <HeartPulse className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Resource Monitor",
      href: "/admin/resources",
      icon: <Activity className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Scheduler Monitor",
      href: "/admin/scheduler",
      icon: <TimerReset className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "System / Infra",
      href: "/admin/system",
      icon: <Server className="h-5 w-5" />,
      roles: ["super_admin"],
    },

    // ── องค์กร & ผู้ใช้ ─────────────────────────────────────────────────────────
    { name: "องค์กร & ผู้ใช้", roles: ["super_admin"] },
    {
      name: "Tenant Onboarding",
      href: "/admin/onboarding",
      icon: <PlusCircle className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "จัดการผู้ใช้",
      href: "/admin/users",
      icon: <Users className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "จัดการ Modules",
      href: "/admin/modules",
      icon: <LayoutGrid className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Module Registry",
      href: "/admin/module-registry",
      icon: <Briefcase className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "ประกาศถึงผู้ใช้",
      href: "/admin/announcements",
      icon: <Megaphone className="h-5 w-5" />,
      roles: ["super_admin"],
    },

    // ── การเงิน & บริการ ───────────────────────────────────────────────────────
    { name: "การเงิน & บริการ", roles: ["super_admin"] },
    {
      name: "Payments & Subscriptions",
      href: "/admin/payments",
      icon: <Wallet className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Billing & Plans",
      href: "/admin/billing",
      icon: <CreditCard className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "แกะเสียง / MoM",
      href: "/admin/stt-stats",
      icon: <Mic className="h-5 w-5" />,
      roles: ["super_admin"],
      dropdownItems: [
        { name: "ภาพรวม & สถิติ", href: "/admin/stt-stats", roles: ["super_admin"] },
        { name: "รายได้ (Billing)", href: "/admin/stt-billing", roles: ["super_admin"] },
        { name: "ต้นทุน Gemini", href: "/admin/stt-cost", roles: ["super_admin"] },
        { name: "งานแกะเสียง (Jobs)", href: "/admin/stt-jobs", roles: ["super_admin"] },
      ],
    },

    // ── ระบบ & ความปลอดภัย ─────────────────────────────────────────────────────
    { name: "ระบบ & ความปลอดภัย", roles: ["super_admin"] },
    {
      name: "Webhooks",
      href: "/admin/webhooks",
      icon: <Webhook className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Rate Limits",
      href: "/admin/rate-limits",
      icon: <ShieldBan className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Audit Log",
      href: "/admin/audit",
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "บันทึกการจัดการ",
      href: "/admin/admin-audit",
      icon: <ScrollText className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "System Settings",
      href: "/admin/settings",
      icon: <Settings2 className="h-5 w-5" />,
      roles: ["super_admin"],
    },
  ];
}

// ─── Assistant module ───────────────────────────────────────────────────────
// ─── ผู้ช่วย AI (assistant) — per-profile, top-level ไม่มี org ───────────────────
function buildSttMenuItems(_org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "ผู้ช่วย AI", roles: allRoles },
    {
      name: l("transcribe", "ถอดเสียง"),
      href: `/assistant`,
      icon: <Mic className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("calendar", "เชื่อมต่อ Google"),
      href: `/assistant/calendar`,
      icon: <Link2 className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("usage", "การใช้งาน"),
      href: `/assistant/usage`,
      icon: <BarChart3 className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("billing", "การชำระเงิน"),
      href: `/assistant/billing`,
      icon: <CreditCard className="h-5 w-5" />,
      roles: allRoles,
    },
  ];
}

// ─── Payroll module ─────────────────────────────────────────────────────────
function buildPayrollMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const p  = (path: string) => `/${org}/payroll/${path}`;
  const l  = (key: string, fallback: string) => labels[key] || fallback;
  const ls = (menu: string, key: string, fallback: string) => labels[`${menu}.${key}`] || fallback;
  return [
    { name: "Payroll", roles: allRoles },
    { name: l("reports",    "รายงาน"),           href: p("reports"),        icon: <BarChart3 className="h-5 w-5" />,   roles: allRoles },
    { name: l("salary",     "เงินเดือน"),        href: `/${org}/payroll`,   icon: <ReceiptText className="h-5 w-5" />, roles: allRoles },
    { name: l("employees",  "พนักงาน"),          href: p("employees"),      icon: <Users className="h-5 w-5" />,       roles: allRoles },
    { name: l("departments","แผนก"),             href: p("departments"),    icon: <Building2 className="h-5 w-5" />,   roles: allRoles },
    { name: l("pay-items",  "เงินเพิ่ม/เงินหัก"), href: p("pay-items"),   icon: <DollarSign className="h-5 w-5" />,  roles: allRoles },
    {
      name: l("settings", "ตั้งค่า"),
      href: p("funds"),
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: ls("settings", "funds",               "ข้อมูลกองทุน"),           href: p("funds"),               roles: allRoles },
        { name: ls("settings", "accounting-settings", "ตั้งค่าการบันทึกบัญชี"), href: p("accounting-settings"), roles: allRoles },
      ],
    },
  ];
}

// ─── CRM module ─────────────────────────────────────────────────────────────
function buildCrmMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const c = (path: string) => `/${org}/crm/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "CRM & Solutions" },
    { name: l("dashboard", "Dashboard"),  href: `/${org}/crm`,  icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: l("clients",   "ลูกค้า"),    href: c("clients"),    icon: <Briefcase className="h-5 w-5" /> },
    { name: l("solutions", "Solutions"),  href: c("solutions"),  icon: <Kanban className="h-5 w-5" /> },
  ];
}

// ─── TMC module ─────────────────────────────────────────────────────────────
function buildTmcMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const t = (path: string) => `/${org}/tmc/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "TMC Management" },
    { name: l("dashboard",  "Dashboard"),        href: `/${org}/tmc`,   icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: l("finance",    "บัญชีและการเงิน"), href: t("finance"),    icon: <Landmark className="h-5 w-5" /> },
    { name: l("petty-cash", "เงินสดย่อย"),      href: t("petty-cash"), icon: <Wallet className="h-5 w-5" /> },
    { name: l("stock",      "Stock คลัง"),       href: t("stock"),      icon: <Package className="h-5 w-5" /> },
    { name: l("stays",      "การเข้าพัก"),       href: t("stays"),      icon: <Building2 className="h-5 w-5" /> },
    { name: "ต้นทุน & กำไร",                     href: t("costs"),      icon: <TrendingUp className="h-5 w-5" /> },
  ];
}

// ─── Accounting Firm module ──────────────────────────────────────────────────
function buildAccFirmMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const f = (path: string) => `/${org}/acc-firm/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "สำนักงานบัญชี" },
    { name: l("dashboard",       "Dashboard"),           href: `/${org}/acc-firm`,  icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: l("clients",         "Client Orgs"),          href: f("clients"),         icon: <Building2 className="h-5 w-5" /> },
    { name: l("reports",         "รายงานรวม"),            href: f("reports"),         icon: <BarChart3 className="h-5 w-5" /> },
    { name: l("petty-cash",      "เงินสดย่อย"),           href: f("petty-cash"),      icon: <Wallet className="h-5 w-5" /> },
    { name: l("service-clients", "ลูกค้าบริการ"),         href: f("service-clients"), icon: <Calculator className="h-5 w-5" /> },
  ];
}

// ─── US Villa PMS module ─────────────────────────────────────────────────────
function buildUsvillaMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const p = (path: string) => `/${org}/usvilla/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "PMS — Us Villa" },
    { name: l("dashboard", "รายวัน"),          href: `/${org}/usvilla`, icon: <BedDouble className="h-5 w-5" /> },
    { name: "ปฏิทิน",                          href: p("calendar"),     icon: <CalendarDays className="h-5 w-5" /> },
    { name: "บันทึกประจำวัน",                  href: p("sheet"),        icon: <ClipboardList className="h-5 w-5" /> },
    { name: "รายงานรายได้",                    href: p("report"),       icon: <BarChart3 className="h-5 w-5" /> },
  ];
}

// ─── Just Me module ──────────────────────────────────────────────────────────
function buildJustMeMenuItems(org: string, orgRole?: string | null, labels: Record<string, string> = {}): MenuItem[] {
  const p = (path: string) => `/${org}/just-me/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  const items: MenuItem[] = [
    { name: "Just Me" },
  ];

  // Only show Dashboard to owner and admin roles
  if (orgRole === "owner" || orgRole === "admin") {
    items.push({ name: l("dashboard", "Dashboard"), href: `/${org}/just-me`, icon: <LayoutDashboard className="h-5 w-5" /> });
    items.push({ name: l("travel_claims", "อนุมัติค่าเดินทาง"), href: p("travel-claims"), icon: <Navigation className="h-5 w-5" /> });
  }

  items.push({ name: "เวลาทำงานและการเดินทาง", href: p("clock-in-out"), icon: <Clock className="h-5 w-5" /> });
  items.push({ name: l("inventory", "คลังสินค้า (Inventory)"), href: p("inventory"), icon: <Package className="h-5 w-5" /> });
  return items;
}

// ─── Jaquar module ───────────────────────────────────────────────────────────
function buildJaquarMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  const p = (path: string) => `/${org}/jaquar/${path}`;
  return [
    { name: "Jaquar" },
    { name: l("dashboard", "Dashboard"), href: `/${org}/jaquar`, icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: l("stock", "คลังสินค้า (Stock)"), href: p("stock"), icon: <Package className="h-5 w-5" /> },
  ];
}

function buildB2gMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "B2G" },
    { name: l("dashboard", "Dashboard"), href: `/${org}/b2g`, icon: <LayoutDashboard className="h-5 w-5" /> },
  ];
}


function buildP2pSupplyMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "P2P Supply" },
    { name: l("dashboard", "Dashboard"), href: `/${org}/p2p-supply`, icon: <LayoutDashboard className="h-5 w-5" /> },
  ];
}


function buildP2pGroupMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "P2P Group" },
    { name: l("dashboard", "Dashboard"), href: `/${org}/p2p-group`, icon: <LayoutDashboard className="h-5 w-5" /> },
  ];
}


function buildHrmMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "HR" },
    { name: l("dashboard", "Dashboard"), href: `/${org}/hrm`, icon: <LayoutDashboard className="h-5 w-5" /> },
  ];
}


// ─── Context picker ─────────────────────────────────────────────────────────

function pickMenuContext(pathname: string, role: Role | null, enabledKeys: string[]): string {
  const segments = (pathname || "/").split("/").filter(Boolean);

  // /admin/* is always admin console
  if (segments[0] === "admin") return role === "super_admin" ? "admin" : "user";

  // /assistant/* = ผู้ช่วย AI (per-profile, top-level ไม่มี org)
  if (segments[0] === "assistant") return "stt";

  // For org routes: /:orgSlug/:module/*  →  segments[1] is the module key
  if (segments.length >= 2) {
    const mod = segments[1];
    if (mod === "payroll")   return "payroll";
    if (mod === "tmc")       return "tmc";
    if (mod === "crm")       return "crm";
    if (mod === "acc-firm")  return "acc_firm";
    if (mod === "just-me")   return "just_me";
    if (mod === "usvilla")   return "usvilla";
    if (mod === "jaquar")    return "jaquar";
    if (mod === "b2g") return "b2g";
    if (mod === "p2p-supply") return "p2p_supply";
    if (mod === "p2p-group") return "p2p_group";
    if (mod === "hrm") return "hrm";
    if (mod === "accounting") return "user";
  }

  // Fallback: pick based on what's enabled
  if (enabledKeys.includes("accounting")) return "user";
  if (enabledKeys.includes("tmc"))        return "tmc";
  if (enabledKeys.includes("crm"))        return "crm";
  if (enabledKeys.includes("acc_firm"))   return "acc_firm";
  if (enabledKeys.includes("payroll"))    return "payroll";
  if (enabledKeys.includes("stt"))        return "stt";
  return "user";
}

export function getMenuItems(
  role: Role | null,
  pathname: string,
  enabledKeys: string[] = [],
  orgSlug: string = "",
  orgRole?: string | null,
  menuLabels: Record<string, Record<string, string>> = {},
): MenuItem[] {
  // Fallback: always resolve orgSlug from the URL's first segment so links
  // are never empty even if context hasn't propagated yet.
  const segments = pathname.split("/").filter(Boolean);
  const slugFromPath = segments[0] && !SYSTEM_SEGMENTS.has(segments[0]) ? segments[0] : "";
  const org = orgSlug || slugFromPath;

  const context = pickMenuContext(pathname, role, enabledKeys);
  const items =
    context === "admin"     ? buildAdminMenuItems()                                      :
    context === "stt"       ? buildSttMenuItems(org,      menuLabels.stt       ?? {})    :
    context === "payroll"   ? buildPayrollMenuItems(org,  menuLabels.payroll   ?? {})    :
    context === "tmc"       ? buildTmcMenuItems(org,      menuLabels.tmc       ?? {})    :
    context === "crm"       ? buildCrmMenuItems(org,      menuLabels.crm       ?? {})    :
    context === "acc_firm"  ? buildAccFirmMenuItems(org,  menuLabels.acc_firm  ?? {})    :
    context === "just_me"   ? buildJustMeMenuItems(org, orgRole, menuLabels.just_me ?? {}) :
    context === "usvilla"   ? buildUsvillaMenuItems(org,  menuLabels.usvilla   ?? {})    :
    context === "jaquar"    ? buildJaquarMenuItems(org,   menuLabels.jaquar    ?? {})    :
    context === "b2g" ? buildB2gMenuItems(org, menuLabels.b2g ?? {}) :
    context === "p2p_supply" ? buildP2pSupplyMenuItems(org, menuLabels.p2p_supply ?? {}) :
    context === "p2p_group" ? buildP2pGroupMenuItems(org, menuLabels.p2p_group ?? {}) :
    context === "hrm" ? buildHrmMenuItems(org, menuLabels.hrm ?? {}) :
    buildUserMenuItems(org, menuLabels.accounting ?? {});

  return items.filter((item) => {
    if (!("href" in item)) return hasRole(item.roles, role);
    if (item.dropdownItems?.length) {
      const filtered = item.dropdownItems.filter((d) => hasRole(d.roles, role));
      item.dropdownItems = filtered;
      if (filtered.length === 0) return false;
    }
    return hasRole(item.roles, role);
  });
}
