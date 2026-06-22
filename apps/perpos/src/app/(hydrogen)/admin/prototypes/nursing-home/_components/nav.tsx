"use client";

// nav.tsx — sub-navigation ของ prototype nursing_home + NursingShell (เปลือกหน้าทุกหน้า)
// เพราะอยู่ใต้ admin zone ไม่มี sidebar โมดูล จึงทำ sidebar ในหน้าเอง (MODULE_MENUS §6)
// import: import { NursingShell } from "../_components/nav";  (หรือ "../../_components/nav" จากหน้า detail)

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Pill,
  HeartPulse,
  NotebookPen,
  AlertTriangle,
  BedDouble,
  UserPlus,
  UserCog,
  CalendarClock,
  ListChecks,
  LogIn,
  Package,
  FileText,
  Wallet,
  BarChart3,
  FlaskConical,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { RoleSwitcher } from "./role-switcher";

const BASE = "/admin/prototypes/nursing-home";

type NavItem = { seg: string; label: string; icon: React.ReactNode };
type NavGroup = { key: string; label: string; items: NavItem[] };

// MODULE_MENUS.nursing_home §6 — 6 กลุ่ม / 18 หน้า
const NAV: NavGroup[] = [
  {
    key: "overview",
    label: "ภาพรวม",
    items: [{ seg: "", label: "แดชบอร์ด", icon: <LayoutDashboard className="h-4 w-4" /> }],
  },
  {
    key: "care",
    label: "การดูแล & สุขภาพ",
    items: [
      { seg: "residents", label: "ผู้พักอาศัย", icon: <Users className="h-4 w-4" /> },
      { seg: "care-plans", label: "แผนการดูแล", icon: <ClipboardList className="h-4 w-4" /> },
      { seg: "medications", label: "ตารางให้ยา (eMAR)", icon: <Pill className="h-4 w-4" /> },
      { seg: "vitals", label: "สัญญาณชีพ", icon: <HeartPulse className="h-4 w-4" /> },
      { seg: "daily-logs", label: "บันทึกประจำวัน", icon: <NotebookPen className="h-4 w-4" /> },
      { seg: "incidents", label: "รายงานเหตุการณ์", icon: <AlertTriangle className="h-4 w-4" /> },
    ],
  },
  {
    key: "facility",
    label: "อาคาร & การเยี่ยม",
    items: [
      { seg: "rooms", label: "ห้อง & เตียง", icon: <BedDouble className="h-4 w-4" /> },
      { seg: "visits", label: "การเยี่ยม", icon: <UserPlus className="h-4 w-4" /> },
    ],
  },
  {
    key: "workforce",
    label: "พนักงาน & เวร",
    items: [
      { seg: "staff", label: "พนักงาน", icon: <UserCog className="h-4 w-4" /> },
      { seg: "shifts", label: "ตารางเวร", icon: <CalendarClock className="h-4 w-4" /> },
      { seg: "assignments", label: "มอบหมายดูแล", icon: <ListChecks className="h-4 w-4" /> },
      { seg: "checkins", label: "เช็คอิน-เอาท์", icon: <LogIn className="h-4 w-4" /> },
    ],
  },
  {
    key: "billing",
    label: "ค่าบริการ & การเงิน",
    items: [
      { seg: "packages", label: "แพ็กเกจค่าบริการ", icon: <Package className="h-4 w-4" /> },
      { seg: "invoices", label: "ใบแจ้งหนี้", icon: <FileText className="h-4 w-4" /> },
      { seg: "payments", label: "การรับชำระ", icon: <Wallet className="h-4 w-4" /> },
    ],
  },
  {
    key: "reports",
    label: "รายงาน",
    items: [{ seg: "reports", label: "รายงาน", icon: <BarChart3 className="h-4 w-4" /> }],
  },
];

function hrefFor(seg: string): string {
  return seg ? `${BASE}/${seg}` : BASE;
}

function isActive(pathname: string, seg: string): boolean {
  const href = hrefFor(seg);
  if (seg === "") return pathname === BASE || pathname === `${BASE}/`;
  // active เมื่อ path เริ่มด้วย href (ครอบ detail page เช่น residents/[id])
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NursingSidebar() {
  const pathname = usePathname() ?? BASE;
  return (
    <nav className="space-y-4">
      {NAV.map((group) => (
        <div key={group.key}>
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {group.label}
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.seg);
              return (
                <li key={item.seg || "dashboard"}>
                  <Link
                    href={hrefFor(item.seg)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                    )}
                  >
                    <span className={cn(active ? "text-primary" : "text-gray-400")}>
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * NursingShell — เปลือกหน้ามาตรฐานของทุกหน้า prototype nursing_home
 * รวม PageShell (container/header) + sidebar nav (MODULE_MENUS) + role switcher + ป้าย PROTOTYPE
 *
 * ทุกหน้าใช้:
 *   <NursingShell title="ผู้พักอาศัย" description="..." actions={<Button>...</Button>}>
 *     ...content...
 *   </NursingShell>
 */
export function NursingShell({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PageShell width="full">
      {/* แถบ prototype + role switcher */}
      <div className="-mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
          <FlaskConical className="h-4 w-4" />
          PROTOTYPE — ข้อมูลตัวอย่าง (mock) ไม่เชื่อมต่อฐานข้อมูลจริง
        </div>
        <RoleSwitcher className="sm:w-auto" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* sidebar — desktop sticky, mobile แนวนอนเลื่อนได้ */}
        <aside className="lg:col-span-3 xl:col-span-2">
          <div className="lg:sticky lg:top-16">
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
              <NursingSidebar />
            </div>
          </div>
        </aside>

        {/* content */}
        <main className="min-w-0 lg:col-span-9 xl:col-span-10">
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-semibold leading-tight text-primary">
                {icon}
                {title}
              </h1>
              {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
            </div>
            {actions && (
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
            )}
          </header>
          <div className="space-y-5">{children}</div>
        </main>
      </div>
    </PageShell>
  );
}
