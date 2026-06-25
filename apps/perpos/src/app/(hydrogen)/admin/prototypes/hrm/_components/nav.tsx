"use client";

// nav.tsx — sub-navigation ของ prototype hrm + HrmShell (เปลือกหน้าทุกหน้า)
// เพราะอยู่ใต้ admin zone ไม่มี sidebar โมดูล จึงทำ sidebar ในหน้าเอง (MODULE_MENUS §3)
// import: import { HrmShell } from "../_components/nav";  (หรือ "../../_components/nav" จากหน้า detail)

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarOff,
  Clock,
  Settings,
  FlaskConical,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { RoleSwitcher } from "./role-switcher";

const BASE = "/admin/prototypes/hrm";

type NavItem = { seg: string; label: string; icon: React.ReactNode };
type NavGroup = { key: string; label: string; items: NavItem[] };

// MODULE_MENUS.hrm §3 — 6 รายการหลัก
const NAV: NavGroup[] = [
  {
    key: "overview",
    label: "ภาพรวม",
    items: [{ seg: "", label: "ภาพรวม", icon: <LayoutDashboard className="h-4 w-4" /> }],
  },
  {
    key: "people",
    label: "บุคคล & เงินเดือน",
    items: [
      { seg: "employees", label: "พนักงาน", icon: <Users className="h-4 w-4" /> },
      { seg: "payroll", label: "เงินเดือน", icon: <Wallet className="h-4 w-4" /> },
    ],
  },
  {
    key: "attendance",
    label: "ลา & เวลาทำงาน",
    items: [
      { seg: "leave", label: "การลา", icon: <CalendarOff className="h-4 w-4" /> },
      { seg: "time", label: "เวลาทำงาน", icon: <Clock className="h-4 w-4" /> },
    ],
  },
  {
    key: "config",
    label: "ตั้งค่า",
    items: [{ seg: "settings", label: "ตั้งค่า", icon: <Settings className="h-4 w-4" /> }],
  },
];

function hrefFor(seg: string): string {
  return seg ? `${BASE}/${seg}` : BASE;
}

function isActive(pathname: string, seg: string): boolean {
  const href = hrefFor(seg);
  if (seg === "") return pathname === BASE || pathname === `${BASE}/`;
  // active เมื่อ path เริ่มด้วย href (ครอบ detail page เช่น employees/[id])
  return pathname === href || pathname.startsWith(`${href}/`);
}

function HrmSidebar() {
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
 * HrmShell — เปลือกหน้ามาตรฐานของทุกหน้า prototype hrm
 * รวม PageShell (container/header) + sidebar nav (MODULE_MENUS) + role switcher + ป้าย PROTOTYPE
 *
 * ทุกหน้าใช้:
 *   <HrmShell title="พนักงาน" description="..." actions={<Button>...</Button>}>
 *     ...content...
 *   </HrmShell>
 */
export function HrmShell({
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
    <PageShell
      width="full"
      title={
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
      }
      description={description}
      actions={actions}
      tabs={
        // แถบ prototype + role switcher (ใต้ header)
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
            <FlaskConical className="h-4 w-4" />
            PROTOTYPE — ข้อมูลตัวอย่าง (mock) ไม่เชื่อมต่อฐานข้อมูลจริง
          </div>
          <RoleSwitcher className="sm:w-auto" />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* sidebar — desktop sticky, mobile แนวนอนเลื่อนได้ */}
        <aside className="lg:col-span-3 xl:col-span-2">
          <div className="lg:sticky lg:top-16">
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
              <HrmSidebar />
            </div>
          </div>
        </aside>

        {/* content */}
        <main className="min-w-0 lg:col-span-9 xl:col-span-10">
          <div className="space-y-5">{children}</div>
        </main>
      </div>
    </PageShell>
  );
}
