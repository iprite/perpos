"use client";

// nav.tsx — MattiiShell (เปลือกหน้าทุกหน้า) + sidebar ตาม MODULE_MENUS §1.1 และ NAV_BY_ROLE §1.2
// prototype อยู่ใต้ admin zone (ไม่มี sidebar ของโมดูล) จึงทำ sidebar ในหน้าเอง
// import: import { MattiiShell } from "../_components";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Package,
  Palette,
  Printer,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { RoleSwitcher } from "./role-switcher";
import { useMattiiRole, type MattiiRole } from "./role-context";

export const MATTII_BASE = "/admin/prototypes/mattii-ops";

type NavItem = {
  /** key ตาม MODULE_MENUS §1.1 (ใช้กับ NAV_BY_ROLE) */
  key: string;
  /** route segment ("" = หน้าแรก) */
  seg: string;
  label: string;
  icon: React.ReactNode;
  /** false = ยังไม่ได้สร้างหน้าในรอบนี้ → แสดงเป็นรายการ "เร็ว ๆ นี้" (ไม่ลิงก์ = ไม่ 404) */
  ready?: boolean;
};
type NavGroup = { key: string; label: string; items: NavItem[] };

// MODULE_MENUS.mattii_ops §1.1 — 12 หน้า 5 กลุ่ม
const NAV: NavGroup[] = [
  {
    key: "daily",
    label: "งานประจำวัน",
    items: [
      {
        key: "dashboard",
        seg: "",
        label: "ภาพรวม",
        icon: <LayoutDashboard className="h-4 w-4" />,
        ready: true,
      },
      {
        key: "inbox",
        seg: "inbox",
        label: "กล่องแชทรวม",
        icon: <MessageSquare className="h-4 w-4" />,
        ready: true,
      },
      {
        key: "orders",
        seg: "orders",
        label: "ออเดอร์",
        icon: <ShoppingBag className="h-4 w-4" />,
        ready: true,
      },
    ],
  },
  {
    key: "ops",
    label: "งานผลิต",
    items: [
      {
        key: "design",
        seg: "design",
        label: "งานแบบลาย & CF",
        icon: <Palette className="h-4 w-4" />,
        ready: true,
      },
      {
        key: "production",
        seg: "production",
        label: "งานผลิต",
        icon: <Printer className="h-4 w-4" />,
        ready: true,
      },
      {
        key: "shipments",
        seg: "shipments",
        label: "จัดส่ง",
        icon: <Truck className="h-4 w-4" />,
        ready: true,
      },
    ],
  },
  {
    key: "master",
    label: "ข้อมูลหลัก",
    items: [
      {
        key: "customers",
        seg: "customers",
        label: "ลูกค้า",
        icon: <Users className="h-4 w-4" />,
        ready: true,
      },
      {
        key: "products",
        seg: "products",
        label: "แบบพรม & ขนาด/ราคา",
        icon: <Package className="h-4 w-4" />,
        ready: true,
      },
      {
        key: "materials",
        seg: "materials",
        label: "วัสดุ & สต๊อก",
        icon: <Boxes className="h-4 w-4" />,
        ready: true,
      },
    ],
  },
  {
    key: "money",
    label: "เงิน & รายงาน",
    items: [
      {
        key: "payments",
        seg: "payments",
        label: "การเงิน",
        icon: <Wallet className="h-4 w-4" />,
        ready: true,
      },
      {
        key: "reports",
        seg: "reports",
        label: "รายงาน & กำไร",
        icon: <BarChart3 className="h-4 w-4" />,
        ready: true,
      },
    ],
  },
  {
    key: "system",
    label: "ระบบ",
    items: [
      {
        key: "settings",
        seg: "settings",
        label: "ตั้งค่า & การเชื่อมต่อ",
        icon: <Settings className="h-4 w-4" />,
        ready: true,
      },
    ],
  },
];

/** §1.2 NAV_BY_ROLE — เมนูที่ "โผล่" ต่อ role (นอก list = ไม่แสดงเลย ไม่ใช่ disable) */
const NAV_BY_ROLE: Record<MattiiRole, string[]> = {
  owner: [
    "dashboard",
    "inbox",
    "orders",
    "design",
    "production",
    "shipments",
    "customers",
    "products",
    "materials",
    "payments",
    "reports",
    "settings",
  ],
  sale: ["dashboard", "inbox", "orders", "design", "shipments", "customers", "payments"],
  designer: ["dashboard", "design", "orders"],
  production: ["dashboard", "production", "shipments", "materials"],
};

function hrefFor(seg: string): string {
  return seg ? `${MATTII_BASE}/${seg}` : MATTII_BASE;
}

function isActive(pathname: string, seg: string): boolean {
  const href = hrefFor(seg);
  if (seg === "") return pathname === MATTII_BASE || pathname === `${MATTII_BASE}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function MattiiSidebar() {
  const pathname = usePathname() ?? MATTII_BASE;
  const { role } = useMattiiRole();
  const allowed = NAV_BY_ROLE[role];

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((it) => allowed.includes(it.key)),
  })).filter((g) => g.items.length > 0);

  return (
    <nav className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {group.label}
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              if (!item.ready) {
                return (
                  <li key={item.key}>
                    <div
                      aria-disabled="true"
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-gray-400"
                    >
                      <span className="text-gray-300">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                        เร็ว ๆ นี้
                      </span>
                    </div>
                  </li>
                );
              }
              const active = isActive(pathname, item.seg);
              return (
                <li key={item.key}>
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
 * MattiiShell — เปลือกหน้ามาตรฐานของทุกหน้า prototype mattii_ops
 * PageShell (container/header) + sidebar (NAV_BY_ROLE) + role switcher + ป้าย PROTOTYPE
 */
export function MattiiShell({
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
          {/* sticky ต้องหยุด "ใต้" header ของ PageShell (sticky bg-white z-10) ไม่มุดเข้าไปใต้มัน
              header สติ๊กที่ calc(banner+3rem) ตอน <xl และ top-0 ตอน xl · สูง ~82px (เผื่อ desc 2 บรรทัด ~7rem) */}
          <div className="lg:sticky lg:top-[calc(var(--impersonation-banner-height,0px)+9.5rem)] xl:top-[6.5rem]">
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
              <MattiiSidebar />
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
