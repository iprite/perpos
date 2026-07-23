"use client";

// nav.tsx — HotelShell (เปลือกหน้าทุกหน้า) + HotelSidebar (MODULE_MENUS.hotel §6)
// อยู่ใต้ admin zone ไม่มี sidebar โมดูล จึงทำ sidebar ในหน้าเอง
// import: import { HotelShell } from "../_components/nav";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  CalendarCheck,
  ClipboardList,
  Users,
  DoorOpen,
  Tag,
  Sparkles,
  Wallet,
  BarChart3,
  FlaskConical,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { RoleSwitcher } from "./role-switcher";

const BASE = "/admin/prototypes/hotel";

type NavItem = { seg: string; label: string; icon: React.ReactNode };
type NavGroup = { key: string; label: string; items: NavItem[] };

// MODULE_MENUS.hotel §6 — ปฏิทินขึ้นก่อน (กันจองชน = คุณค่าอันดับ 1)
const NAV: NavGroup[] = [
  {
    key: "overview",
    label: "ภาพรวม",
    items: [{ seg: "", label: "แดชบอร์ด", icon: <LayoutDashboard className="h-4 w-4" /> }],
  },
  {
    key: "front-desk",
    label: "หน้าเคาน์เตอร์",
    items: [
      { seg: "calendar", label: "ปฏิทินการจอง", icon: <CalendarRange className="h-4 w-4" /> },
      { seg: "bookings", label: "การจอง", icon: <CalendarCheck className="h-4 w-4" /> },
      { seg: "daily", label: "บันทึกประจำวัน", icon: <ClipboardList className="h-4 w-4" /> },
      { seg: "guests", label: "ทะเบียนแขก", icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    key: "rooms",
    label: "ห้องพัก",
    items: [
      { seg: "rooms", label: "ห้อง & สถานะ", icon: <DoorOpen className="h-4 w-4" /> },
      { seg: "room-types", label: "ตั้งค่าประเภท/ราคา A/V/C", icon: <Tag className="h-4 w-4" /> },
      { seg: "housekeeping", label: "แม่บ้าน", icon: <Sparkles className="h-4 w-4" /> },
    ],
  },
  {
    key: "finance",
    label: "การเงิน",
    items: [
      { seg: "payments", label: "การรับชำระ", icon: <Wallet className="h-4 w-4" /> },
      { seg: "reports", label: "รายงานรายได้", icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
];

function hrefFor(seg: string): string {
  return seg ? `${BASE}/${seg}` : BASE;
}

function isActive(pathname: string, seg: string): boolean {
  const href = hrefFor(seg);
  if (seg === "") return pathname === BASE || pathname === `${BASE}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function HotelSidebar() {
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
 * HotelShell — เปลือกหน้ามาตรฐานของทุกหน้า prototype hotel
 * PageShell (container/header) + sidebar nav (MODULE_MENUS) + role switcher + ป้าย PROTOTYPE
 */
export function HotelShell({
  title,
  description,
  icon,
  actions,
  tabs,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** แท็บเสริมใต้ banner (เช่น reports: รายงาน/แจ้งเตือน LINE) */
  tabs?: React.ReactNode;
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
        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
              <FlaskConical className="h-4 w-4" />
              PROTOTYPE — ข้อมูลตัวอย่าง (mock) ไม่เชื่อมต่อฐานข้อมูลจริง
            </div>
            <RoleSwitcher className="sm:w-auto" />
          </div>
          {tabs}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <aside className="lg:col-span-3 xl:col-span-2">
          {/* sticky ต้องหยุด "ใต้" header ของ PageShell (sticky bg-white z-10 · สูง ~82px)
              ไม่มุดเข้าไปใต้มัน — header สติ๊กที่ calc(banner+3rem) ตอน <xl, top-0 ตอน xl (เผื่อ desc 2 บรรทัด) */}
          <div className="lg:sticky lg:top-[calc(var(--impersonation-banner-height,0px)+9.5rem)] xl:top-[6.5rem]">
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
              <HotelSidebar />
            </div>
          </div>
        </aside>
        <main className="min-w-0 lg:col-span-9 xl:col-span-10">
          <div className="space-y-5">{children}</div>
        </main>
      </div>
    </PageShell>
  );
}
