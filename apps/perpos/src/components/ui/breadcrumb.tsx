"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href: string };

// Maps path prefix → { group label, group is not clickable (no href) }
const GROUP_MAP: Record<string, string> = {
  // Accounting
  "/executive-dashboard":    "รายงาน",
  "/financial-reports":      "รายงาน",
  "/tax-and-closing":        "รายงาน",
  "/sales":                  "ขาย",
  "/purchase":               "ซื้อ",
  "/assets":                 "สินทรัพย์",
  "/finance":                "การเงิน / บัญชี",
  "/journal":                "บัญชี",
  "/accounts":               "บัญชี",
  "/contacts":               "ผู้ติดต่อ",
  "/inventory":              "สินค้า",
  "/tax/vat":                "ภาษีมูลค่าเพิ่ม",
  "/tax/pp30":               "ภาษีมูลค่าเพิ่ม",
  "/tax/wht-certificates":   "ภาษีหัก ณ ที่จ่าย",
  "/tax/pnd":                "ภาษีหัก ณ ที่จ่าย",
  "/tax":                    "ตั้งค่า",
  "/bank":                   "ตั้งค่า",
  "/security":               "ตั้งค่า",
  "/settings":               "ตั้งค่า",
  // Payroll
  "/payroll":                "Payroll",
  // Admin
  "/admin":                  "แอดมินคอนโซล",
};

const PAGE_MAP: Record<string, string> = {
  // รายงาน
  "/executive-dashboard":                  "แดชบอร์ดผู้บริหาร",
  "/financial-reports":                    "รายงานการเงิน",
  "/tax-and-closing":                      "ภาษี & ปิดงบ",

  // ขาย
  "/sales/quotations":                     "ใบเสนอราคา",
  "/sales/quotations/new":                 "สร้างใหม่",
  "/sales/deposits":                       "ใบรับมัดจำ",
  "/sales/deposits/new":                   "สร้างใหม่",
  "/sales/invoices":                       "ใบแจ้งหนี้",
  "/sales/invoices/new":                   "สร้างใหม่",
  "/sales/receipts":                       "ใบเสร็จรับเงิน",
  "/sales/receipts/new":                   "สร้างใหม่",
  "/sales/tax-invoices":                   "ใบกำกับภาษีขาย",
  "/sales/tax-invoices/new":               "สร้างใหม่",
  "/sales/etax-invoices":                  "e-Tax Invoice",
  "/sales/etax-invoices/new":              "สร้างใหม่",
  "/sales/credit-notes":                   "ใบลดหนี้",
  "/sales/credit-notes/new":               "สร้างใหม่",
  "/sales/debit-notes":                    "ใบเพิ่มหนี้",
  "/sales/debit-notes/new":               "สร้างใหม่",
  "/sales/billing-notes":                  "ใบวางบิล",
  "/sales/billing-notes/new":              "สร้างใหม่",

  // ซื้อ
  "/purchase/orders":                      "ใบสั่งซื้อ",
  "/purchase/orders/new":                  "สร้างใหม่",
  "/purchase/deposits":                    "ใบจ่ายมัดจำ",
  "/purchase/deposits/new":               "สร้างใหม่",
  "/purchase/goods-receipts":              "บันทึกซื้อสินค้า",
  "/purchase/goods-receipts/new":          "สร้างใหม่",
  "/purchase/expenses":                    "บันทึกค่าใช้จ่าย",
  "/purchase/expenses/new":               "สร้างใหม่",
  "/purchase/wht-expenses":               "บันทึกรายจ่ายภาษีหัก ณ ที่จ่าย",
  "/purchase/wht-expenses/new":           "สร้างใหม่",
  "/purchase/tax-invoices":               "ใบกำกับภาษีซื้อ",
  "/purchase/tax-invoices/new":           "สร้างใหม่",
  "/purchase/payment-summaries":          "ใบรวมจ่าย",
  "/purchase/payment-summaries/new":      "สร้างใหม่",
  "/purchase/received-credit-notes":      "รับใบลดหนี้",
  "/purchase/received-credit-notes/new":  "สร้างใหม่",
  "/purchase/received-debit-notes":       "รับใบเพิ่มหนี้",
  "/purchase/received-debit-notes/new":   "สร้างใหม่",

  // สินทรัพย์
  "/assets/register":                     "ทะเบียนสินทรัพย์",
  "/assets/disposals":                    "ขายสินทรัพย์",

  // การเงิน / บัญชี
  "/finance/petty-cash-accounts":         "เงินสดย่อย",
  "/finance/bank-accounts":               "บัญชีธนาคาร",
  "/finance/payment-channels":            "ช่องทางรับเงิน",
  "/finance/reserve-accounts":            "บัญชีสำรอง",
  "/finance/check-deposits":              "เช็ครับ",
  "/finance/check-payments":              "เช็คจ่าย",
  "/finance/wht-received":               "ภาษีถูกหัก ณ ที่จ่าย",
  "/finance/wht-paid":                    "ภาษีหัก ณ ที่จ่าย",
  "/finance/ledger":                      "บัญชีแยกประเภท",
  "/finance/balance-sheet":               "งบดุล",
  "/finance/trial-balance":               "งบทดลอง",
  "/finance/financial-position":          "งบฐานะการเงิน",
  "/finance/income-statement":            "งบกำไรขาดทุน",
  "/finance/cash-flow":                   "งบกระแสเงินสด",
  "/journal":                             "สมุดรายวัน",
  "/accounts":                            "ผังบัญชี",

  // ผู้ติดต่อ
  "/contacts/customers":                  "ลูกค้า",
  "/contacts/vendors":                    "ผู้ขาย",

  // สินค้า
  "/inventory/products":                  "สินค้า/บริการ",
  "/inventory/units":                     "หน่วย",
  "/inventory":                           "สินค้า/สต๊อก",
  "/inventory/requisitions":              "ใบเบิกสินค้า",
  "/inventory/returns":                   "ใบส่งคืนเบิกสินค้า",

  // ภาษีมูลค่าเพิ่ม
  "/tax/vat/sales":                       "รายการภาษีขาย",
  "/tax/vat/purchases":                   "รายการภาษีซื้อ",
  "/tax/pp30":                            "แบบ ภ.พ.30",

  // ภาษีหัก ณ ที่จ่าย
  "/tax/wht-certificates":               "ใบหัก ณ ที่จ่าย",
  "/tax/pnd/1":                           "แบบ ภ.ง.ด.1",
  "/tax/pnd/2":                           "แบบ ภ.ง.ด.2",
  "/tax/pnd/3":                           "แบบ ภ.ง.ด.3",
  "/tax/pnd/53":                          "แบบ ภ.ง.ด.53",

  // ตั้งค่า
  "/settings/users":                      "ผู้ใช้งาน",
  "/settings/roles":                      "สิทธิ์การใช้งาน",
  "/tax/wht-documents":                   "WHT + เอกสาร",
  "/bank/reconciliation":                 "กระทบยอดธนาคาร",
  "/security/audit-logs":                 "Audit Logs",
  "/settings/organization":              "ตั้งค่าองค์กร",
  "/settings":                            "ข้อมูลส่วนตัว",

  // Payroll
  "/payroll/reports":                     "รายงาน",
  "/payroll/salary":                      "เงินเดือน",
  "/payroll/employees":                   "พนักงาน",
  "/payroll/departments":                 "แผนก",
  "/payroll/pay-items":                   "เงินเพิ่ม/เงินหัก",
  "/payroll/settings/funds":              "ข้อมูลกองทุน",
  "/payroll/settings/accounting":         "ตั้งค่าการบันทึกบัญชี",

  // Admin
  "/admin":                               "ภาพรวม",
  "/admin/users":                         "ผู้ใช้",
  "/admin/permissions":                   "สิทธิ์รายฟังก์ชัน",
  "/admin/news-agent":                    "News Agent",
  "/admin/delivery":                      "การส่งผ่าน LINE",
};

// For [id] detail pages, derive from parent list label
const DETAIL_PARENTS: Array<{ prefix: string; parent: string; parentHref: string }> = [
  { prefix: "/tax/pp30/",              parent: "แบบ ภ.พ.30",        parentHref: "/tax/pp30" },
  { prefix: "/tax/wht-certificates/",  parent: "ใบหัก ณ ที่จ่าย",   parentHref: "/tax/wht-certificates" },
];

function getGroup(path: string): string | null {
  // longest match first
  const keys = Object.keys(GROUP_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (path === k || path.startsWith(k + "/")) return GROUP_MAP[k];
  }
  return null;
}

function getCrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [];

  // Check dynamic detail pages first
  for (const { prefix, parent, parentHref } of DETAIL_PARENTS) {
    if (pathname.startsWith(prefix) && pathname !== prefix) {
      const group = getGroup(pathname);
      if (group) crumbs.push({ label: group, href: parentHref });
      crumbs.push({ label: parent, href: parentHref });
      crumbs.push({ label: "รายละเอียด", href: pathname });
      return crumbs;
    }
  }

  // Direct match
  const pageLabel = PAGE_MAP[pathname];
  if (pageLabel) {
    const group = getGroup(pathname);
    if (group) {
      // Find a reasonable group href (first page in that group)
      const groupHref = Object.entries(PAGE_MAP).find(
        ([p]) => GROUP_MAP[Object.keys(GROUP_MAP).sort((a, b) => b.length - a.length).find(k => p === k || p.startsWith(k + "/")) ?? ""] === group && p !== pathname
      )?.[0] ?? pathname;
      crumbs.push({ label: group, href: groupHref });
    }
    crumbs.push({ label: pageLabel, href: pathname });
    return crumbs;
  }

  // /new sub-pages: derive parent
  if (pathname.endsWith("/new")) {
    const parentPath = pathname.slice(0, -4);
    const parentLabel = PAGE_MAP[parentPath];
    const currentLabel = PAGE_MAP[pathname] ?? "สร้างใหม่";
    const group = getGroup(parentPath);
    if (group) {
      const groupHref = Object.entries(PAGE_MAP).find(
        ([p]) => GROUP_MAP[Object.keys(GROUP_MAP).sort((a, b) => b.length - a.length).find(k => p === k || p.startsWith(k + "/")) ?? ""] === group && p !== parentPath && p !== pathname
      )?.[0] ?? parentPath;
      crumbs.push({ label: group, href: groupHref });
    }
    if (parentLabel) crumbs.push({ label: parentLabel, href: parentPath });
    crumbs.push({ label: currentLabel, href: pathname });
    return crumbs;
  }

  return crumbs;
}

export function Breadcrumb() {
  const pathname = usePathname() ?? "/";
  const crumbs = getCrumbs(pathname);

  if (crumbs.length < 2) return null;

  return (
    <nav className="flex items-center gap-1 px-1 py-2 text-sm text-slate-500">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
            {isLast ? (
              <span className="text-slate-700 font-medium">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:text-slate-900 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
