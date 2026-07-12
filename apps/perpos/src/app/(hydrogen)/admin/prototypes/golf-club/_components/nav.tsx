"use client";

// nav.tsx — GolfShell (เปลือกหน้าทุกหน้า prototype golf-club)
// PageShell + prototype banner + role switcher + แถบเมนู 10 หน้า (tab §4: row เดียว overflow-x-auto)
// import: import { GolfShell } from "../_components/nav";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  Target,
  ClipboardList,
  Users,
  BadgeCheck,
  Tag,
  BarChart3,
  MessageCircle,
  Settings,
  FlaskConical,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { RoleSwitcher } from "./role-switcher";

const BASE = "/admin/prototypes/golf-club";

/**
 * useGolfBase — คืน base path ของโซน golf-club ตาม URL ปัจจุบัน
 * รองรับทั้ง /admin/prototypes/golf-club (super_admin preview) และ /demo/golf-club (public demo)
 * → nav/router.push ใช้ base เดียวกันได้ทั้งสองโซนโดยไม่ hardcode
 */
export function useGolfBase(): string {
  const pathname = usePathname() ?? BASE;
  const i = pathname.indexOf("/golf-club");
  return i >= 0 ? pathname.slice(0, i + "/golf-club".length) : BASE;
}

type NavItem = { seg: string; label: string; icon: React.ReactNode };

// MODULE_MENUS.golf_club §5 (line-preview = prototype-only)
const NAV: NavItem[] = [
  { seg: "", label: "แดชบอร์ด", icon: <LayoutDashboard className="h-4 w-4" /> },
  { seg: "tee-times", label: "ตารางจองสนาม", icon: <CalendarRange className="h-4 w-4" /> },
  { seg: "driving-range", label: "ตารางจองไดร์ฟ", icon: <Target className="h-4 w-4" /> },
  { seg: "bookings", label: "รายการจอง", icon: <ClipboardList className="h-4 w-4" /> },
  { seg: "members", label: "สมาชิก/ลูกค้า", icon: <Users className="h-4 w-4" /> },
  { seg: "membership", label: "แพ็กเกจสมาชิก", icon: <BadgeCheck className="h-4 w-4" /> },
  { seg: "pricing", label: "ราคา & แพ็กเกจ", icon: <Tag className="h-4 w-4" /> },
  { seg: "reports", label: "รายงาน", icon: <BarChart3 className="h-4 w-4" /> },
  { seg: "line-preview", label: "จำลอง LINE", icon: <MessageCircle className="h-4 w-4" /> },
  { seg: "settings", label: "ตั้งค่า", icon: <Settings className="h-4 w-4" /> },
];

function hrefFor(base: string, seg: string): string {
  return seg ? `${base}/${seg}` : base;
}

function isActive(base: string, pathname: string, seg: string): boolean {
  const href = hrefFor(base, seg);
  if (seg === "") return pathname === base || pathname === `${base}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function GolfNav() {
  const base = useGolfBase();
  const pathname = usePathname() ?? base;
  return (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((item) => {
        const active = isActive(base, pathname, item.seg);
        return (
          <Link
            key={item.seg || "dashboard"}
            href={hrefFor(base, item.seg)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-150",
              active
                ? "bg-gray-100 font-medium text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            <span className={cn(active ? "text-primary" : "text-gray-400")}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * GolfShell — เปลือกหน้ามาตรฐานของทุกหน้า prototype golf-club
 * PageShell (container/header) + prototype banner + role switcher + แถบเมนู
 */
export function GolfShell({
  title,
  description,
  icon,
  actions,
  extraTabs,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** แถบเสริมใต้ nav (เช่น reports: toggle มุมมอง) */
  extraTabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  const base = useGolfBase();
  const isDemo = base.startsWith("/demo/");
  return (
    <PageShell
      width="wide"
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
              {isDemo
                ? "เดโมทดลองใช้ — ข้อมูลตัวอย่าง กดลองได้ทุกฟังก์ชัน ไม่บันทึกลงระบบจริง"
                : "PROTOTYPE — ข้อมูลตัวอย่าง (mock) ไม่เชื่อมต่อฐานข้อมูลจริง"}
            </div>
            <RoleSwitcher className="sm:w-auto" />
          </div>
          <GolfNav />
          {extraTabs}
        </div>
      }
    >
      <div className="space-y-5">{children}</div>
    </PageShell>
  );
}
