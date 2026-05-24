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
  BotMessageSquare,
  LayoutGrid,
  PlusCircle,
  Activity,
  Webhook,
  ShieldBan,
  CreditCard,
  HeartPulse,
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

const SYSTEM_SEGMENTS = new Set(["admin", "user", "signin", "no-org", "no-module"]);

function hasRole(itemRoles: Role[] | undefined, role: Role | null) {
  if (!itemRoles) return true;
  if (!role) return false;
  return itemRoles.includes(role);
}

// ─── Accounting module ──────────────────────────────────────────────────────
function buildUserMenuItems(org: string): MenuItem[] {
  const a = (path: string) => `/${org}/accounting/${path}`;
  const base = `/${org}/accounting`;
  return [
    { name: "Accounting", roles: allRoles },
    {
      name: "รายงาน",
      href: base,
      icon: <BarChart3 className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "แดชบอร์ดผู้บริหาร", href: base,                  roles: allRoles },
        { name: "รายงานการเงิน",     href: a("reports"),           roles: allRoles },
        { name: "ภาษี & ปิดงบ",      href: a("tax-and-closing"),  roles: allRoles },
      ],
    },
    {
      name: "ขาย",
      href: a("quotations"),
      icon: <ReceiptText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ใบเสนอราคา",        href: a("quotations"),         roles: allRoles },
        { name: "ใบรับมัดจำ",        href: a("received-deposits"),  roles: allRoles },
        { name: "ใบแจ้งหนี้",        href: a("invoices"),           roles: allRoles },
        { name: "ใบเสร็จรับเงิน",    href: a("receipts"),           roles: allRoles },
        { name: "ใบกำกับภาษีขาย",    href: a("tax-invoices"),       roles: allRoles },
        { name: "e-Tax Invoice",      href: a("etax-invoices"),      roles: allRoles },
        { name: "ใบลดหนี้",          href: a("credit-notes"),       roles: allRoles },
        { name: "ใบเพิ่มหนี้",       href: a("debit-notes"),        roles: allRoles },
        { name: "ใบวางบิล",          href: a("billing-notes"),      roles: allRoles },
      ],
    },
    {
      name: "ซื้อ",
      href: a("purchase-orders"),
      icon: <ShoppingCart className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ใบสั่งซื้อ",                           href: a("purchase-orders"),         roles: allRoles },
        { name: "ใบจ่ายมัดจำ",                          href: a("paid-deposits"),            roles: allRoles },
        { name: "บันทึกค่าใช้จ่าย",                     href: a("expenses"),                 roles: allRoles },
        { name: "บันทึกรายจ่ายที่มีภาษีหัก ณ ที่จ่าย", href: a("wht-expenses"),             roles: allRoles },
        { name: "ใบกำกับภาษีซื้อ",                      href: a("purchase-tax-invoices"),    roles: allRoles },
        { name: "ใบรวมจ่าย",                            href: a("payment-summaries"),        roles: allRoles },
        { name: "รับใบลดหนี้",                          href: a("received-credit-notes"),    roles: allRoles },
        { name: "รับใบเพิ่มหนี้",                       href: a("received-debit-notes"),     roles: allRoles },
        { name: "รับสินค้า",                            href: a("goods-receipts"),           roles: allRoles },
      ],
    },
    {
      name: "การเงิน",
      href: a("bank-accounts"),
      icon: <Wallet className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "เงินสดย่อย",            href: a("petty-cash-accounts"), roles: allRoles },
        { name: "บัญชีธนาคาร",           href: a("bank-accounts"),       roles: allRoles },
        { name: "ช่องทางรับเงิน",        href: a("payment-channels"),    roles: allRoles },
        { name: "บัญชีสำรอง",            href: a("reserve-accounts"),    roles: allRoles },
        { name: "เช็ครับ",               href: a("check-deposits"),      roles: allRoles },
        { name: "เช็คจ่าย",              href: a("check-payments"),      roles: allRoles },
        { name: "ภาษีถูกหัก ณ ที่จ่าย", href: a("wht-received"),        roles: allRoles },
        { name: "ภาษีหัก ณ ที่จ่าย",    href: a("wht-paid"),            roles: allRoles },
      ],
    },
    {
      name: "บัญชี",
      href: a("journal"),
      icon: <BookOpenText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "สมุดรายวัน",     href: a("journal"),             roles: allRoles },
        { name: "ผังบัญชี",       href: a("accounts"),            roles: allRoles },
        { name: "บัญชีแยกประเภท", href: a("ledger"),              roles: allRoles },
        { name: "งบดุล",          href: a("balance-sheet"),       roles: allRoles },
        { name: "งบทดลอง",        href: a("trial-balance"),       roles: allRoles },
        { name: "งบฐานะการเงิน",  href: a("financial-position"),  roles: allRoles },
        { name: "งบกำไรขาดทุน",   href: a("income-statement"),    roles: allRoles },
        { name: "งบกระแสเงินสด",  href: a("cash-flow"),           roles: allRoles },
      ],
    },
    {
      name: "สินทรัพย์",
      href: a("assets-register"),
      icon: <Landmark className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ทะเบียนสินทรัพย์", href: a("assets-register"),  roles: allRoles },
        { name: "ซื้อสินทรัพย์",    href: a("goods-receipts"),   roles: allRoles },
        { name: "ขายสินทรัพย์",     href: a("assets-disposals"), roles: allRoles },
      ],
    },
    {
      name: "ภาษีมูลค่าเพิ่ม",
      href: a("pp30"),
      icon: <Percent className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "รายการภาษีขาย",  href: a("vat-sales"),     roles: allRoles },
        { name: "รายการภาษีซื้อ", href: a("vat-purchases"), roles: allRoles },
        { name: "แบบ ภ.พ.30",     href: a("pp30"),          roles: allRoles },
      ],
    },
    {
      name: "ภาษีหัก ณ ที่จ่าย",
      href: a("wht-certificates"),
      icon: <FileText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ใบหัก ณ ที่จ่าย", href: a("wht-certificates"), roles: allRoles },
        { name: "แบบ ภ.ง.ด.1",     href: a("pnd/1"),            roles: allRoles },
        { name: "แบบ ภ.ง.ด.2",     href: a("pnd/2"),            roles: allRoles },
        { name: "แบบ ภ.ง.ด.3",     href: a("pnd/3"),            roles: allRoles },
        { name: "แบบ ภ.ง.ด.53",    href: a("pnd/53"),           roles: allRoles },
      ],
    },
    {
      name: "ผู้ติดต่อ",
      href: a("customers"),
      icon: <Contact className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ลูกค้า", href: a("customers"), roles: allRoles },
        { name: "ผู้ขาย", href: a("vendors"),   roles: allRoles },
      ],
    },
    {
      name: "สินค้า",
      href: a("products"),
      icon: <Package className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "สินค้า/บริการ",       href: a("products"),     roles: allRoles },
        { name: "หน่วย",               href: a("units"),        roles: allRoles },
        { name: "สินค้า/สต๊อก",        href: a("inventory"),   roles: allRoles },
        { name: "ใบเบิกสินค้า",        href: a("requisitions"), roles: allRoles },
        { name: "ใบส่งคืนเบิกสินค้า", href: a("returns"),      roles: allRoles },
      ],
    },
    {
      name: "ตั้งค่า",
      href: a("wht-documents"),
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ผู้ใช้งาน",       href: a("accounting-users"), roles: allRoles },
        { name: "สิทธิ์การใช้งาน", href: a("roles"),            roles: allRoles },
        { name: "WHT + เอกสาร",   href: a("wht-documents"),    roles: allRoles },
        { name: "กระทบยอดธนาคาร", href: a("reconciliation"),   roles: allRoles },
        { name: "Audit Logs",     href: a("audit-logs"),       roles: allRoles },
        { name: "ตั้งค่าองค์กร",  href: `/${org}/setting`,    roles: allRoles },
      ],
    },
  ];
}

// ─── Admin module ───────────────────────────────────────────────────────────
function buildAdminMenuItems(): MenuItem[] {
  return [
    { name: "แอดมินคอนโซล", roles: ["super_admin"] },
    {
      name: "Dashboard",
      href: "/admin",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Tenant Onboarding",
      href: "/admin/onboarding",
      icon: <PlusCircle className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "User Management",
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
      name: "Resource Monitor",
      href: "/admin/resources",
      icon: <Activity className="h-5 w-5" />,
      roles: ["super_admin"],
    },
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
      name: "Billing & Plans",
      href: "/admin/billing",
      icon: <CreditCard className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Tenant Health",
      href: "/admin/health",
      icon: <HeartPulse className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "Audit Log",
      href: "/admin/audit",
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: ["super_admin"],
    },
  ];
}

// ─── Assistant module ───────────────────────────────────────────────────────
function buildAssistantMenuItems(org: string): MenuItem[] {
  return [
    { name: "Assistant", roles: allRoles },
    {
      name: "Task Manager",
      href: `/${org}/assistant`,
      icon: <BotMessageSquare className="h-5 w-5" />,
      roles: allRoles,
    },
  ];
}

// ─── Payroll module ─────────────────────────────────────────────────────────
function buildPayrollMenuItems(org: string): MenuItem[] {
  const p = (path: string) => `/${org}/payroll/${path}`;
  return [
    { name: "Payroll", roles: allRoles },
    { name: "รายงาน",        href: p("reports"),             icon: <BarChart3 className="h-5 w-5" />,   roles: allRoles },
    { name: "เงินเดือน",     href: `/${org}/payroll`,        icon: <ReceiptText className="h-5 w-5" />, roles: allRoles },
    { name: "พนักงาน",       href: p("employees"),           icon: <Users className="h-5 w-5" />,       roles: allRoles },
    { name: "แผนก",          href: p("departments"),         icon: <Building2 className="h-5 w-5" />,   roles: allRoles },
    { name: "เงินเพิ่ม/เงินหัก", href: p("pay-items"),      icon: <DollarSign className="h-5 w-5" />,  roles: allRoles },
    {
      name: "ตั้งค่า",
      href: p("funds"),
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ข้อมูลกองทุน",           href: p("funds"),               roles: allRoles },
        { name: "ตั้งค่าการบันทึกบัญชี", href: p("accounting-settings"), roles: allRoles },
      ],
    },
  ];
}

// ─── TMC module ─────────────────────────────────────────────────────────────
function buildTmcMenuItems(org: string): MenuItem[] {
  const t = (path: string) => `/${org}/tmc/${path}`;
  return [
    { name: "TMC Management" },
    { name: "Dashboard",      href: `/${org}/tmc`,   icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: "บัญชีและการเงิน", href: t("finance"),    icon: <Landmark className="h-5 w-5" /> },
    { name: "เงินสดย่อย",     href: t("petty-cash"), icon: <Wallet className="h-5 w-5" /> },
    { name: "Stock คลัง",     href: t("stock"),      icon: <Package className="h-5 w-5" /> },
    { name: "การเข้าพัก",     href: t("stays"),      icon: <Building2 className="h-5 w-5" /> },
  ];
}

// ─── Context picker ─────────────────────────────────────────────────────────

function pickMenuContext(pathname: string, role: Role | null, enabledKeys: string[]): string {
  const segments = (pathname || "/").split("/").filter(Boolean);

  // /admin/* is always admin console
  if (segments[0] === "admin") return role === "super_admin" ? "admin" : "user";

  // For org routes: /:orgSlug/:module/*  →  segments[1] is the module key
  if (segments.length >= 2) {
    const mod = segments[1];
    if (mod === "payroll")   return "payroll";
    if (mod === "assistant") return "assistant";
    if (mod === "tmc")       return "tmc";
    if (mod === "accounting") return "user";
  }

  // Fallback: pick based on what's enabled
  if (enabledKeys.includes("accounting")) return "user";
  if (enabledKeys.includes("tmc"))        return "tmc";
  if (enabledKeys.includes("payroll"))    return "payroll";
  if (enabledKeys.includes("assistant"))  return "assistant";
  return "user";
}

export function getMenuItems(
  role: Role | null,
  pathname: string,
  enabledKeys: string[] = [],
  orgSlug: string = "",
): MenuItem[] {
  // Fallback: always resolve orgSlug from the URL's first segment so links
  // are never empty even if context hasn't propagated yet.
  const segments = pathname.split("/").filter(Boolean);
  const slugFromPath = segments[0] && !SYSTEM_SEGMENTS.has(segments[0]) ? segments[0] : "";
  const org = orgSlug || slugFromPath;

  const context = pickMenuContext(pathname, role, enabledKeys);
  const items =
    context === "admin"     ? buildAdminMenuItems()        :
    context === "payroll"   ? buildPayrollMenuItems(org)   :
    context === "assistant" ? buildAssistantMenuItems(org) :
    context === "tmc"       ? buildTmcMenuItems(org)       :
    buildUserMenuItems(org);

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
