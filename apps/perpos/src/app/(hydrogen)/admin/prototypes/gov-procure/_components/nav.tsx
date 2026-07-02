"use client";

// nav.tsx — GovProcureShell (เปลือกหน้าทุกหน้า) + tab-row nav (MODULE_MENUS.gov_procure §5)
// อยู่ใต้ admin zone ไม่มี sidebar โมดูล → ทำ tab bar ในหน้าเอง (Tab §4: row เดียว overflow-x, ไม่ wrap)
// mirror hotel/_components/nav.tsx (โครง PageShell + banner PROTOTYPE + role switcher)
// import: import { GovProcureShell } from "../_components/nav";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KanbanSquare,
  ClipboardList,
  Wallet,
  BarChart3,
  Settings,
  FlaskConical,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { RoleSwitcher } from "./role-switcher";
import { useRole } from "./role-context";

const BASE = "/admin/prototypes/gov-procure";

type NavItem = { seg: string; label: string; icon: React.ReactNode };

// MODULE_MENUS.gov_procure §5 — 6 tab (Detail เข้าจาก row/card ไม่ใช่ tab)
const NAV: NavItem[] = [
  { seg: "", label: "แดชบอร์ด", icon: <LayoutDashboard className="h-4 w-4" /> },
  { seg: "pipeline", label: "ไปป์ไลน์", icon: <KanbanSquare className="h-4 w-4" /> },
  { seg: "orders", label: "รายการงาน", icon: <ClipboardList className="h-4 w-4" /> },
  { seg: "receivables", label: "เงินค้างรับ", icon: <Wallet className="h-4 w-4" /> },
  { seg: "reports", label: "รายงาน", icon: <BarChart3 className="h-4 w-4" /> },
  { seg: "settings", label: "ตั้งค่า/แจ้งเตือน", icon: <Settings className="h-4 w-4" /> },
];

function hrefFor(seg: string): string {
  return seg ? `${BASE}/${seg}` : BASE;
}

function isActive(pathname: string, seg: string): boolean {
  const href = hrefFor(seg);
  if (seg === "") return pathname === BASE || pathname === `${BASE}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Tab bar (Tab §4) — row เดียว, ล้น → scroll แนวนอน, scrollbar ซ่อน, แท็บ shrink-0 whitespace-nowrap */
function GovProcureTabs() {
  const pathname = usePathname() ?? BASE;
  return (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((item) => {
        const active = isActive(pathname, item.seg);
        return (
          <Link
            key={item.seg || "dashboard"}
            href={hrefFor(item.seg)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-gray-100 text-gray-900"
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
 * GovProcureShell — เปลือกหน้ามาตรฐานของทุกหน้า prototype gov_procure
 * PageShell (container/header) + banner PROTOTYPE + role switcher + tab-row nav
 * viewer → แสดง badge "โหมดดูอย่างเดียว" ที่ banner (spec §1 P2-d)
 */
export function GovProcureShell({
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
  /** แท็บเสริมใต้ nav (เช่น reports/settings แบ่ง sub-view) */
  extraTabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isViewer } = useRole();
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
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-amber-700">
              <FlaskConical className="h-4 w-4" />
              PROTOTYPE — ข้อมูลตัวอย่าง (mock) ไม่เชื่อมต่อฐานข้อมูลจริง
              {isViewer && (
                <span className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  โหมดดูอย่างเดียว
                </span>
              )}
            </div>
            <RoleSwitcher className="sm:w-auto" />
          </div>
          <GovProcureTabs />
          {extraTabs}
        </div>
      }
    >
      <div className="space-y-5">{children}</div>
    </PageShell>
  );
}
