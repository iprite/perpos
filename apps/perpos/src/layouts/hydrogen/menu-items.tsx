import React from "react";
import {
  Newspaper,
  LayoutDashboard,
  Link2,
  Shield,
  Users,
  BookOpenText,
  ReceiptText,
  ShoppingCart,
  BarChart3,
  ShieldCheck,
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

const allRoles: Role[] = ["admin", "user"];

function hasRole(itemRoles: Role[] | undefined, role: Role | null) {
  if (!itemRoles) return true;
  if (!role) return false;
  return itemRoles.includes(role);
}

function buildUserMenuItems(): MenuItem[] {
  return [
    { name: "PERPOS", roles: allRoles },
    {
      name: "แดชบอร์ด",
      href: "/me",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: allRoles,
    },
    {
      name: "บัญชี",
      href: "/journal",
      icon: <BookOpenText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "สมุดรายวัน", href: "/journal", roles: allRoles },
        { name: "ผังบัญชี", href: "/accounts", roles: allRoles },
      ],
    },
    {
      name: "ขาย",
      href: "/sales/quotations",
      icon: <ReceiptText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ใบเสนอราคา",       href: "/sales/quotations",    roles: allRoles },
        { name: "ใบรับมัดจำ",       href: "/sales/deposits",      roles: allRoles },
        { name: "ใบแจ้งหนี้",       href: "/sales/invoices",      roles: allRoles },
        { name: "ใบเสร็จรับเงิน",   href: "/sales/receipts",      roles: allRoles },
        { name: "ใบกำกับภาษีขาย",   href: "/sales/tax-invoices",  roles: allRoles },
        { name: "e-Tax Invoice",     href: "/sales/etax-invoices", roles: allRoles },
        { name: "ใบลดหนี้",         href: "/sales/credit-notes",  roles: allRoles },
        { name: "ใบเพิ่มหนี้",      href: "/sales/debit-notes",   roles: allRoles },
        { name: "ใบวางบิล",         href: "/sales/billing-notes", roles: allRoles },
      ],
    },
    {
      name: "ซื้อ",
      href: "/purchase/orders",
      icon: <ShoppingCart className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ใบสั่งซื้อ",                            href: "/purchase/orders",                 roles: allRoles },
        { name: "ใบจ่ายมัดจำ",                           href: "/purchase/deposits",               roles: allRoles },
        { name: "บันทึกซื้อสินค้า",                       href: "/purchase/goods-receipts",         roles: allRoles },
        { name: "บันทึกค่าใช้จ่าย และการจ่ายเงิน",       href: "/purchase/expenses",               roles: allRoles },
        { name: "บันทึกรายจ่ายที่มีภาษีหัก ณ ที่จ่าย",  href: "/purchase/wht-expenses",          roles: allRoles },
        { name: "ใบกำกับภาษีซื้อ",                        href: "/purchase/tax-invoices",          roles: allRoles },
        { name: "ใบรวมจ่าย",                             href: "/purchase/payment-summaries",      roles: allRoles },
        { name: "รับใบลดหนี้",                           href: "/purchase/received-credit-notes",  roles: allRoles },
        { name: "รับใบเพิ่มหนี้",                        href: "/purchase/received-debit-notes",   roles: allRoles },
      ],
    },
    {
      name: "รายงาน",
      href: "/executive-dashboard",
      icon: <BarChart3 className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "แดชบอร์ดผู้บริหาร", href: "/executive-dashboard", roles: allRoles },
        { name: "รายงานการเงิน", href: "/financial-reports", roles: allRoles },
        { name: "ภาษี & ปิดงบ", href: "/tax-and-closing", roles: allRoles },
      ],
    },
    {
      name: "ฟีเจอร์องค์กร",
      href: "/tax/wht-documents",
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "WHT + เอกสาร", href: "/tax/wht-documents", roles: allRoles },
        { name: "กระทบยอดธนาคาร", href: "/bank/reconciliation", roles: allRoles },
        { name: "สินค้า/สต๊อก", href: "/inventory", roles: allRoles },
        { name: "Audit Logs", href: "/security/audit-logs", roles: allRoles },
        { name: "ตั้งค่าองค์กร", href: "/settings/organization", roles: allRoles },
      ],
    },
  ];
}

function buildAdminMenuItems(): MenuItem[] {
  return [
    { name: "แอดมินคอนโซล", roles: ["admin"] },
    {
      name: "ภาพรวม",
      href: "/admin",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "ผู้ใช้",
      href: "/admin/users",
      icon: <Users className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "สิทธิ์รายฟังก์ชัน",
      href: "/admin/permissions",
      icon: <Shield className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "News Agent",
      href: "/admin/news-agent",
      icon: <Newspaper className="h-5 w-5" />,
      roles: ["admin"],
    },
    {
      name: "การส่งผ่าน LINE",
      href: "/admin/delivery",
      icon: <Link2 className="h-5 w-5" />,
      roles: ["admin"],
    },
  ];
}

function pickMenuContext(pathname: string, role: Role | null) {
  const p = pathname || "/";
  if (p === "/me" || p.startsWith("/me/")) return "user";
  if (p === "/settings" || p.startsWith("/settings/")) return "user";
  if (p.startsWith("/templates")) return "user";
  if (p === "/admin" || p.startsWith("/admin/")) return role === "admin" ? "admin" : "user";
  return role === "admin" ? "admin" : "user";
}

export function getMenuItems(role: Role | null, pathname: string): MenuItem[] {
  const context = pickMenuContext(pathname, role);
  const items = context === "admin" ? buildAdminMenuItems() : buildUserMenuItems();

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
