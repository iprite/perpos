"use client";

// nav.tsx — AccountingShell (เปลือกหน้าทุกหน้า) + AccountingSidebar (2 กลุ่ม หน้าบ้าน/หลังบ้าน)
// อยู่ใต้ admin zone ไม่มี sidebar โมดูล จึงทำ sidebar ในหน้าเอง
//
// U1 (binding): owner default lens = หน้าบ้านเท่านั้น (A1-A5) — กลุ่มหลังบ้าน (B1-B6) collapse
//   ใต้ปุ่ม opt-in "มุมมองนักบัญชี" ที่ owner ต้องกดเปิด · accountant = เห็นทั้ง 2 กลุ่ม default
//   · staff = หน้าบ้านเขียน (หลังบ้านไม่เห็นเลย) · viewer = อ่านทุกอย่าง
// sidebar กรอง item ตาม role (access≠none)
//
// import: import { AccountingShell } from "../_components/nav";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileText,
  Users,
  Package,
  Receipt,
  BookOpen,
  ListTree,
  BarChart3,
  Landmark,
  Boxes,
  Settings,
  FlaskConical,
  Briefcase,
  ChevronDown,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "./role-switcher";
import { useAccountingRole, type Entity } from "./role-context";

const BASE = "/admin/prototypes/accounting";

type NavItem = { seg: string; label: string; icon: React.ReactNode; entity: Entity };
type NavGroup = { key: "frontstage" | "backstage"; label: string; items: NavItem[] };

// 2 กลุ่ม — หน้าบ้าน (owner cockpit) / หลังบ้าน (accountant workspace)
const NAV: NavGroup[] = [
  {
    key: "frontstage",
    label: "หน้าบ้าน",
    items: [
      {
        seg: "",
        label: "ภาพรวม",
        icon: <LayoutDashboard className="h-4 w-4" />,
        entity: "dashboard",
      },
      {
        seg: "entries",
        label: "รายรับ-รายจ่าย",
        icon: <ArrowLeftRight className="h-4 w-4" />,
        entity: "entries",
      },
      {
        seg: "documents",
        label: "เอกสารขาย",
        icon: <FileText className="h-4 w-4" />,
        entity: "documents",
      },
      {
        seg: "contacts",
        label: "ลูกค้า/ผู้ขาย",
        icon: <Users className="h-4 w-4" />,
        entity: "contacts",
      },
      {
        seg: "products",
        label: "สินค้าและบริการ",
        icon: <Package className="h-4 w-4" />,
        entity: "products",
      },
      { seg: "tax", label: "ภาษีของฉัน", icon: <Receipt className="h-4 w-4" />, entity: "tax_my" },
    ],
  },
  {
    key: "backstage",
    label: "หลังบ้าน (นักบัญชี)",
    items: [
      {
        seg: "journal",
        label: "สมุดรายวัน",
        icon: <BookOpen className="h-4 w-4" />,
        entity: "journal",
      },
      {
        seg: "accounts",
        label: "ผังบัญชี",
        icon: <ListTree className="h-4 w-4" />,
        entity: "accounts",
      },
      {
        seg: "reports",
        label: "รายงานการเงิน",
        icon: <BarChart3 className="h-4 w-4" />,
        entity: "reports",
      },
      {
        seg: "tax-closing",
        label: "ภาษี & ปิดงวด",
        icon: <Landmark className="h-4 w-4" />,
        entity: "tax_closing",
      },
      {
        seg: "assets",
        label: "สินทรัพย์ & ค่าเสื่อม",
        icon: <Boxes className="h-4 w-4" />,
        entity: "assets",
      },
      {
        seg: "settings",
        label: "ตั้งค่า",
        icon: <Settings className="h-4 w-4" />,
        entity: "settings",
      },
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

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li>
      <Link
        href={hrefFor(item.seg)}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
          active
            ? "bg-primary/10 font-medium text-primary"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        )}
      >
        <span className={cn(active ? "text-primary" : "text-gray-400")}>{item.icon}</span>
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function AccountingSidebar() {
  const pathname = usePathname() ?? BASE;
  const { role, access } = useAccountingRole();

  // owner default ไม่เปิดหลังบ้าน (U1) — ต้องกดปุ่ม "มุมมองนักบัญชี" เอง
  const [showBackstage, setShowBackstage] = useState(false);

  const frontGroup = NAV[0];
  const backGroup = NAV[1];

  // กรอง item ตาม role (access≠none)
  const visibleFront = frontGroup.items.filter((i) => access(i.entity) !== "none");
  const visibleBack = backGroup.items.filter((i) => access(i.entity) !== "none");

  // owner = collapse default · accountant/viewer = เปิดอยู่แล้ว (default lens) · staff = ไม่มีหลังบ้าน
  const backstageDefaultOpen = role === "accountant" || role === "viewer";
  const backstageOpen = backstageDefaultOpen || showBackstage;

  return (
    <nav className="space-y-4">
      <div>
        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {frontGroup.label}
        </div>
        <ul className="space-y-0.5">
          {visibleFront.map((item) => (
            <NavLink
              key={item.seg || "dashboard"}
              item={item}
              active={isActive(pathname, item.seg)}
            />
          ))}
        </ul>
      </div>

      {visibleBack.length > 0 &&
        (backstageDefaultOpen ? (
          <div>
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {backGroup.label}
            </div>
            <ul className="space-y-0.5">
              {visibleBack.map((item) => (
                <NavLink key={item.seg} item={item} active={isActive(pathname, item.seg)} />
              ))}
            </ul>
          </div>
        ) : (
          // owner — opt-in: ปุ่มเปิด "มุมมองนักบัญชี" (U1)
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowBackstage((v) => !v)}
              className={cn(
                "h-auto w-full justify-between gap-2 rounded-lg border border-dashed border-gray-300 px-2.5 py-2 text-sm font-normal",
                backstageOpen
                  ? "bg-gray-50 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
              )}
            >
              <span className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-gray-400" />
                มุมมองนักบัญชี
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  backstageOpen && "rotate-180",
                )}
              />
            </Button>
            {backstageOpen && (
              <ul className="mt-1 space-y-0.5">
                {visibleBack.map((item) => (
                  <NavLink key={item.seg} item={item} active={isActive(pathname, item.seg)} />
                ))}
              </ul>
            )}
          </div>
        ))}
    </nav>
  );
}

/**
 * AccountingShell — เปลือกหน้ามาตรฐานของทุกหน้า prototype accounting
 * PageShell (container/header) + sidebar nav 2 กลุ่ม + role switcher + ป้าย PROTOTYPE
 */
export function AccountingShell({
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
  /** แท็บเสริมใต้ banner */
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
          <div className="lg:sticky lg:top-16">
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
              <AccountingSidebar />
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
