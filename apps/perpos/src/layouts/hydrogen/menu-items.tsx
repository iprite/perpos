import React from "react";
import {
  LayoutDashboard,
  Users,
  BookOpenText,
  ReceiptText,
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
  TrendingUp,
  Briefcase,
  Kanban,
  Calculator,
  Clock,
  CalendarDays,
  Link2,
  Video,
  ClipboardList,
  BedDouble,
  Navigation,
  Mic,
  ScrollText,
  Sparkles,
  Megaphone,
  Settings2,
  Server,
  FlaskConical,
  Presentation,
  Bug,
} from "lucide-react";

import type { Role } from "@/lib/supabase/types";

export type LabelMenuItem = { name: string; roles?: Role[] };

export type LinkMenuItem = {
  name: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
  roles?: Role[];
  /** route เพิ่มเติมที่ถือว่าเมนูนี้ active ด้วย (ใช้กับกลุ่มที่ยุบเป็นแท็บ เช่น การเงิน/ระบบ) */
  activeMatch?: string[];
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
  const l = (key: string, fallback: string) => labels[key] || fallback;
  const a = (path: string) => `/${org}/accounting/${path}`;
  const base = `/${org}/accounting`;
  // เมนู 2 กลุ่มตรงกับหน้า production จริง (หน้าบ้าน owner cockpit / หลังบ้าน นักบัญชี)
  // role lens ที่เมนู: ไม่กรอง — page guard + NoAccess คุมสิทธิ์ที่หน้า (staff เปิดหลังบ้าน → NoAccess)
  return [
    // ── หน้าบ้าน (owner cockpit) ─────────────────────────────────────────────
    { name: l("frontstage", "หน้าบ้าน"), roles: allRoles },
    {
      name: l("dashboard", "ภาพรวม"),
      href: base,
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("entries", "รายรับ-รายจ่าย"),
      href: a("entries"),
      icon: <DollarSign className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("documents", "เอกสารขาย"),
      href: a("documents"),
      icon: <ReceiptText className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("contacts", "ลูกค้า/ผู้ขาย"),
      href: a("contacts"),
      icon: <Contact className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("products", "สินค้าและบริการ"),
      href: a("products"),
      icon: <Package className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("tax", "ภาษีของฉัน"),
      href: a("tax"),
      icon: <Percent className="h-5 w-5" />,
      roles: allRoles,
    },
    // ── หลังบ้าน (นักบัญชี) ───────────────────────────────────────────────────
    { name: l("backstage", "หลังบ้าน (นักบัญชี)"), roles: allRoles },
    {
      name: l("journal", "สมุดรายวัน"),
      href: a("journal"),
      icon: <BookOpenText className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("accounts", "ผังบัญชี"),
      href: a("accounts"),
      icon: <ScrollText className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("reports", "รายงานการเงิน"),
      href: a("reports"),
      icon: <BarChart3 className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("tax-closing", "ภาษี & ปิดงวด"),
      href: a("tax-closing"),
      icon: <Landmark className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("assets", "สินทรัพย์ & ค่าเสื่อม"),
      href: a("assets"),
      icon: <Package className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: l("settings", "ตั้งค่า"),
      href: a("settings"),
      icon: <Settings2 className="h-5 w-5" />,
      roles: allRoles,
    },
  ];
}

// ─── Admin module ───────────────────────────────────────────────────────────
// จัดเป็น 4 หมวดด้วย section header (label ไม่มี href) — ทุกเมนูคลิกเดียวถึง
// ยกเว้น "แกะเสียง / MoM" ที่เป็น dropdown เพราะมี 3 หน้าย่อย
export function buildAdminMenuItems(): MenuItem[] {
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
      name: "ระบบ & โครงสร้าง",
      href: "/admin/system",
      icon: <Server className="h-5 w-5" />,
      roles: ["super_admin"],
      activeMatch: ["/admin/health", "/admin/resources", "/admin/scheduler"],
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
      name: "การเงิน & บริการ",
      href: "/admin/finance",
      icon: <Wallet className="h-5 w-5" />,
      roles: ["super_admin"],
      activeMatch: ["/admin/payments", "/admin/billing", "/admin/stt-billing", "/admin/tokens"],
    },
    {
      name: "แกะเสียง / MoM",
      href: "/admin/stt-stats",
      icon: <Mic className="h-5 w-5" />,
      roles: ["super_admin"],
      dropdownItems: [
        { name: "ภาพรวม & สถิติ", href: "/admin/stt-stats", roles: ["super_admin"] },
        { name: "ต้นทุน Gemini", href: "/admin/stt-cost", roles: ["super_admin"] },
        { name: "งานแกะเสียง (Jobs)", href: "/admin/stt-jobs", roles: ["super_admin"] },
      ],
    },

    // ── ระบบ & ความปลอดภัย ─────────────────────────────────────────────────────
    { name: "ระบบ & ความปลอดภัย", roles: ["super_admin"] },
    {
      name: "ติดตามปัญหา (Issues)",
      href: "/admin/issues",
      icon: <Bug className="h-5 w-5" />,
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

    // ── เครื่องมือ ─────────────────────────────────────────────────────────────
    { name: "เครื่องมือ", roles: ["super_admin"] },
    {
      name: "Prototypes (preview)",
      href: "/admin/prototypes",
      icon: <FlaskConical className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "สื่อนำเสนอ (Desk)",
      href: "/admin/presentations",
      icon: <Presentation className="h-5 w-5" />,
      roles: ["super_admin"],
    },
    {
      name: "เอกสารผลิตภัณฑ์ (Docs)",
      href: "/admin/product-docs",
      icon: <FileText className="h-5 w-5" />,
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
      name: l("meetings", "ประชุม"),
      href: `/assistant/meetings`,
      icon: <Video className="h-5 w-5" />,
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

// ─── CRM module ─────────────────────────────────────────────────────────────
function buildCrmMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const c = (path: string) => `/${org}/crm/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "CRM & Solutions" },
    {
      name: l("dashboard", "Dashboard"),
      href: `/${org}/crm`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    { name: l("clients", "ลูกค้า"), href: c("clients"), icon: <Briefcase className="h-5 w-5" /> },
    {
      name: l("solutions", "Solutions"),
      href: c("solutions"),
      icon: <Kanban className="h-5 w-5" />,
    },
  ];
}

// ─── TMC module ─────────────────────────────────────────────────────────────
function buildTmcMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const t = (path: string) => `/${org}/tmc/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "TMC Management" },
    {
      name: l("dashboard", "Dashboard"),
      href: `/${org}/tmc`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      name: l("finance", "บัญชีและการเงิน"),
      href: t("finance"),
      icon: <Landmark className="h-5 w-5" />,
    },
    {
      name: l("petty-cash", "เงินสดย่อย"),
      href: t("petty-cash"),
      icon: <Wallet className="h-5 w-5" />,
    },
    { name: l("stock", "Stock คลัง"), href: t("stock"), icon: <Package className="h-5 w-5" /> },
    { name: l("stays", "การเข้าพัก"), href: t("stays"), icon: <Building2 className="h-5 w-5" /> },
    { name: "ต้นทุน & กำไร", href: t("costs"), icon: <TrendingUp className="h-5 w-5" /> },
  ];
}

// ─── Accounting Firm module ──────────────────────────────────────────────────
function buildAccFirmMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const f = (path: string) => `/${org}/acc-firm/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "สำนักงานบัญชี" },
    {
      name: l("dashboard", "Dashboard"),
      href: `/${org}/acc-firm`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      name: l("clients", "Client Orgs"),
      href: f("clients"),
      icon: <Building2 className="h-5 w-5" />,
    },
    {
      name: l("reports", "รายงานรวม"),
      href: f("reports"),
      icon: <BarChart3 className="h-5 w-5" />,
    },
    {
      name: l("petty-cash", "เงินสดย่อย"),
      href: f("petty-cash"),
      icon: <Wallet className="h-5 w-5" />,
    },
    {
      name: l("service-clients", "ลูกค้าบริการ"),
      href: f("service-clients"),
      icon: <Calculator className="h-5 w-5" />,
    },
  ];
}

// ─── US Villa PMS module ─────────────────────────────────────────────────────
function buildUsvillaMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const p = (path: string) => `/${org}/usvilla/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "PMS — Us Villa" },
    {
      name: l("dashboard", "รายวัน"),
      href: `/${org}/usvilla`,
      icon: <BedDouble className="h-5 w-5" />,
    },
    { name: "ปฏิทิน", href: p("calendar"), icon: <CalendarDays className="h-5 w-5" /> },
    { name: "บันทึกประจำวัน", href: p("sheet"), icon: <ClipboardList className="h-5 w-5" /> },
    { name: "รายงานรายได้", href: p("report"), icon: <BarChart3 className="h-5 w-5" /> },
  ];
}

// ─── Just Me module ──────────────────────────────────────────────────────────
function buildJustMeMenuItems(
  org: string,
  orgRole?: string | null,
  labels: Record<string, string> = {},
): MenuItem[] {
  const p = (path: string) => `/${org}/just-me/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  const items: MenuItem[] = [{ name: "Just Me" }];

  // Only show Dashboard to owner and admin roles
  if (orgRole === "owner" || orgRole === "admin") {
    items.push({
      name: l("dashboard", "Dashboard"),
      href: `/${org}/just-me`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    });
    items.push({
      name: l("travel_claims", "อนุมัติค่าเดินทาง"),
      href: p("travel-claims"),
      icon: <Navigation className="h-5 w-5" />,
    });
  }

  items.push({
    name: "เวลาทำงานและการเดินทาง",
    href: p("clock-in-out"),
    icon: <Clock className="h-5 w-5" />,
  });
  items.push({
    name: l("inventory", "คลังสินค้า (Inventory)"),
    href: p("inventory"),
    icon: <Package className="h-5 w-5" />,
  });
  return items;
}

// ─── Jaquar module ───────────────────────────────────────────────────────────
function buildJaquarMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  const p = (path: string) => `/${org}/jaquar/${path}`;
  return [
    { name: "Jaquar" },
    {
      name: l("dashboard", "Dashboard"),
      href: `/${org}/jaquar`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      name: l("stock", "คลังสินค้า (Stock)"),
      href: p("stock"),
      icon: <Package className="h-5 w-5" />,
    },
  ];
}

function buildB2gMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "B2G" },
    {
      name: l("dashboard", "Dashboard"),
      href: `/${org}/b2g`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
  ];
}

function buildP2pSupplyMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "P2P Supply" },
    {
      name: l("dashboard", "Dashboard"),
      href: `/${org}/p2p-supply`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
  ];
}

function buildP2pGroupMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "P2P Group" },
    {
      name: l("dashboard", "Dashboard"),
      href: `/${org}/p2p-group`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
  ];
}

function buildHrmMenuItems(org: string, labels: Record<string, string> = {}): MenuItem[] {
  const h = (path: string) => `/${org}/hrm/${path}`;
  const l = (key: string, fallback: string) => labels[key] || fallback;
  return [
    { name: "HR" },
    {
      name: l("dashboard", "ภาพรวม"),
      href: `/${org}/hrm`,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    { name: l("employees", "พนักงาน"), href: h("employees"), icon: <Users className="h-5 w-5" /> },
    {
      name: l("payroll", "เงินเดือน"),
      href: h("payroll"),
      icon: <ReceiptText className="h-5 w-5" />,
    },
    { name: l("leave", "การลา"), href: h("leave"), icon: <CalendarDays className="h-5 w-5" /> },
    { name: l("time", "เวลาทำงาน"), href: h("time"), icon: <Clock className="h-5 w-5" /> },
    {
      name: l("settings", "ตั้งค่า"),
      href: h("settings"),
      icon: <Settings2 className="h-5 w-5" />,
    },
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
    if (mod === "tmc") return "tmc";
    if (mod === "crm") return "crm";
    if (mod === "acc-firm") return "acc_firm";
    if (mod === "just-me") return "just_me";
    if (mod === "usvilla") return "usvilla";
    if (mod === "jaquar") return "jaquar";
    if (mod === "b2g") return "b2g";
    if (mod === "p2p-supply") return "p2p_supply";
    if (mod === "p2p-group") return "p2p_group";
    if (mod === "hrm") return "hrm";
    if (mod === "accounting") return "user";
  }

  // Fallback: pick based on what's enabled
  if (enabledKeys.includes("accounting")) return "user";
  if (enabledKeys.includes("tmc")) return "tmc";
  if (enabledKeys.includes("crm")) return "crm";
  if (enabledKeys.includes("acc_firm")) return "acc_firm";
  if (enabledKeys.includes("hrm")) return "hrm";
  if (enabledKeys.includes("stt")) return "stt";
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
    context === "admin"
      ? buildAdminMenuItems()
      : context === "stt"
        ? buildSttMenuItems(org, menuLabels.stt ?? {})
        : context === "tmc"
          ? buildTmcMenuItems(org, menuLabels.tmc ?? {})
          : context === "crm"
            ? buildCrmMenuItems(org, menuLabels.crm ?? {})
            : context === "acc_firm"
              ? buildAccFirmMenuItems(org, menuLabels.acc_firm ?? {})
              : context === "just_me"
                ? buildJustMeMenuItems(org, orgRole, menuLabels.just_me ?? {})
                : context === "usvilla"
                  ? buildUsvillaMenuItems(org, menuLabels.usvilla ?? {})
                  : context === "jaquar"
                    ? buildJaquarMenuItems(org, menuLabels.jaquar ?? {})
                    : context === "b2g"
                      ? buildB2gMenuItems(org, menuLabels.b2g ?? {})
                      : context === "p2p_supply"
                        ? buildP2pSupplyMenuItems(org, menuLabels.p2p_supply ?? {})
                        : context === "p2p_group"
                          ? buildP2pGroupMenuItems(org, menuLabels.p2p_group ?? {})
                          : context === "hrm"
                            ? buildHrmMenuItems(org, menuLabels.hrm ?? {})
                            : buildUserMenuItems(org, menuLabels.accounting ?? {});

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
