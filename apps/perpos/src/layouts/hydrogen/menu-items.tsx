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
  Wallet,
  Package,
  Contact,
  Building2,
  DollarSign,
  Landmark,
  FileText,
  Percent,
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
    { name: "Accounting", roles: allRoles },
    {
      name: "รายงาน",
      href: "/executive-dashboard",
      icon: <BarChart3 className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "แดชบอร์ดผู้บริหาร", href: "/executive-dashboard", roles: allRoles },
        { name: "รายงานการเงิน",     href: "/financial-reports",   roles: allRoles },
        { name: "ภาษี & ปิดงบ",      href: "/tax-and-closing",     roles: allRoles },
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
        { name: "บันทึกค่าใช้จ่าย และการจ่ายเงิน",       href: "/purchase/expenses",               roles: allRoles },
        { name: "บันทึกรายจ่ายที่มีภาษีหัก ณ ที่จ่าย",  href: "/purchase/wht-expenses",          roles: allRoles },
        { name: "ใบกำกับภาษีซื้อ",                        href: "/purchase/tax-invoices",          roles: allRoles },
        { name: "ใบรวมจ่าย",                             href: "/purchase/payment-summaries",      roles: allRoles },
        { name: "รับใบลดหนี้",                           href: "/purchase/received-credit-notes",  roles: allRoles },
        { name: "รับใบเพิ่มหนี้",                        href: "/purchase/received-debit-notes",   roles: allRoles },
      ],
    },
    {
      name: "การเงิน",
      href: "/finance/bank-accounts",
      icon: <Wallet className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "เงินสดย่อย",            href: "/finance/petty-cash-accounts", roles: allRoles },
        { name: "บัญชีธนาคาร",           href: "/finance/bank-accounts",       roles: allRoles },
        { name: "ช่องทางรับเงิน",        href: "/finance/payment-channels",    roles: allRoles },
        { name: "บัญชีสำรอง",            href: "/finance/reserve-accounts",    roles: allRoles },
        { name: "เช็ครับ",               href: "/finance/check-deposits",      roles: allRoles },
        { name: "เช็คจ่าย",              href: "/finance/check-payments",      roles: allRoles },
        { name: "ภาษีถูกหัก ณ ที่จ่าย", href: "/finance/wht-received",        roles: allRoles },
        { name: "ภาษีหัก ณ ที่จ่าย",    href: "/finance/wht-paid",            roles: allRoles },
      ],
    },
    {
      name: "บัญชี",
      href: "/journal",
      icon: <BookOpenText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "สมุดรายวัน",    href: "/journal",                    roles: allRoles },
        { name: "ผังบัญชี",      href: "/accounts",                   roles: allRoles },
        { name: "บัญชีแยกประเภท", href: "/finance/ledger",            roles: allRoles },
        { name: "งบดุล",          href: "/finance/balance-sheet",     roles: allRoles },
        { name: "งบทดลอง",        href: "/finance/trial-balance",     roles: allRoles },
        { name: "งบฐานะการเงิน",  href: "/finance/financial-position", roles: allRoles },
        { name: "งบกำไรขาดทุน",   href: "/finance/income-statement",  roles: allRoles },
        { name: "งบกระแสเงินสด",  href: "/finance/cash-flow",         roles: allRoles },
      ],
    },
    {
      name: "สินทรัพย์",
      href: "/assets/register",
      icon: <Landmark className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ทะเบียนสินทรัพย์", href: "/assets/register",          roles: allRoles },
        { name: "ซื้อสินทรัพย์",    href: "/purchase/goods-receipts",  roles: allRoles },
        { name: "ขายสินทรัพย์",     href: "/assets/disposals",         roles: allRoles },
      ],
    },
    {
      name: "ภาษีมูลค่าเพิ่ม",
      href: "/tax/pp30",
      icon: <Percent className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "รายการภาษีขาย",  href: "/tax/vat/sales",     roles: allRoles },
        { name: "รายการภาษีซื้อ", href: "/tax/vat/purchases",  roles: allRoles },
        { name: "แบบ ภ.พ.30",     href: "/tax/pp30",           roles: allRoles },
      ],
    },
    {
      name: "ภาษีหัก ณ ที่จ่าย",
      href: "/tax/wht-certificates",
      icon: <FileText className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ใบหัก ณ ที่จ่าย", href: "/tax/wht-certificates", roles: allRoles },
        { name: "แบบ ภ.ง.ด.1",     href: "/tax/pnd/1",            roles: allRoles },
        { name: "แบบ ภ.ง.ด.2",     href: "/tax/pnd/2",            roles: allRoles },
        { name: "แบบ ภ.ง.ด.3",     href: "/tax/pnd/3",            roles: allRoles },
        { name: "แบบ ภ.ง.ด.53",    href: "/tax/pnd/53",           roles: allRoles },
      ],
    },
    {
      name: "ผู้ติดต่อ",
      href: "/contacts/customers",
      icon: <Contact className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ลูกค้า", href: "/contacts/customers", roles: allRoles },
        { name: "ผู้ขาย", href: "/contacts/vendors",   roles: allRoles },
      ],
    },
    {
      name: "สินค้า",
      href: "/inventory/products",
      icon: <Package className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "สินค้า/บริการ",       href: "/inventory/products",    roles: allRoles },
        { name: "หน่วย",               href: "/inventory/units",        roles: allRoles },
        { name: "สินค้า/สต๊อก",        href: "/inventory",             roles: allRoles },
        { name: "ใบเบิกสินค้า",        href: "/inventory/requisitions", roles: allRoles },
        { name: "ใบส่งคืนเบิกสินค้า", href: "/inventory/returns",      roles: allRoles },
      ],
    },
    {
      name: "ตั้งค่า",
      href: "/tax/wht-documents",
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "WHT + เอกสาร",   href: "/tax/wht-documents",     roles: allRoles },
        { name: "กระทบยอดธนาคาร", href: "/bank/reconciliation",    roles: allRoles },
        { name: "Audit Logs",     href: "/security/audit-logs",    roles: allRoles },
        { name: "ตั้งค่าองค์กร",  href: "/settings/organization",  roles: allRoles },
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

function buildPayrollMenuItems(): MenuItem[] {
  return [
    { name: "Payroll", roles: allRoles },
    { name: "รายงาน", href: "/payroll/reports", icon: <BarChart3 className="h-5 w-5" />, roles: allRoles },
    { name: "เงินเดือน", href: "/payroll/salary", icon: <ReceiptText className="h-5 w-5" />, roles: allRoles },
    { name: "พนักงาน", href: "/payroll/employees", icon: <Users className="h-5 w-5" />, roles: allRoles },
    { name: "แผนก", href: "/payroll/departments", icon: <Building2 className="h-5 w-5" />, roles: allRoles },
    { name: "เงินเพิ่ม/เงินหัก", href: "/payroll/pay-items", icon: <DollarSign className="h-5 w-5" />, roles: allRoles },
    {
      name: "ตั้งค่า",
      href: "/payroll/settings/funds",
      icon: <ShieldCheck className="h-5 w-5" />,
      roles: allRoles,
      dropdownItems: [
        { name: "ข้อมูลกองทุน", href: "/payroll/settings/funds", roles: allRoles },
        { name: "ตั้งค่าการบันทึกบัญชี", href: "/payroll/settings/accounting", roles: allRoles },
      ],
    },
  ];
}

function pickMenuContext(pathname: string, role: Role | null) {
  const p = pathname || "/";
  if (p === "/admin" || p.startsWith("/admin/")) return role === "admin" ? "admin" : "user";
  if (p.startsWith("/payroll")) return "payroll";
  return "user";
}

export function getMenuItems(role: Role | null, pathname: string): MenuItem[] {
  const context = pickMenuContext(pathname, role);
  const items =
    context === "admin"   ? buildAdminMenuItems()   :
    context === "payroll" ? buildPayrollMenuItems()  :
    buildUserMenuItems();

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
