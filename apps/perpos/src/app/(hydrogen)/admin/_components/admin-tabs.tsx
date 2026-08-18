"use client";

/**
 * AdminTabs — แถบแท็บร่วมสำหรับกลุ่มหน้า admin ที่ยุบรวมกัน
 *
 * ใช้กับกลุ่ม "การเงิน" (/admin/finance) และ "ระบบ" (/admin/system) ที่เดิมเป็น
 * เมนูแยกหลายอัน — ตอนนี้รวมเป็นเมนูเดียว + สลับด้วยแท็บ (แต่ละแท็บยังเป็น route
 * ของตัวเองเพื่อไม่ต้องรื้อ logic เดิม) · active = เทียบ pathname
 *
 * วาง element นี้ผ่าน prop `tabs` ของ <AdminPage>/<PageShell>
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import cn from "@core/utils/class-names";

export interface AdminTabItem {
  label: string;
  href: string;
}

/** แท็บกลุ่มระบบ & โครงสร้าง */
export const SYSTEM_TABS: AdminTabItem[] = [
  // ลำดับ = ตอนไฟไหม้ดูจากซ้าย: เครื่อง/บริการ (infra) ก่อน แล้วค่อยสุขภาพรายลูกค้า
  { label: "เครื่อง & บริการ (VPS/workers)", href: "/admin/system" },
  { label: "Scheduler", href: "/admin/scheduler" },
  { label: "ทรัพยากร DB/Storage", href: "/admin/resources" },
  { label: "สุขภาพรายองค์กร (API/billing)", href: "/admin/health" },
];

export function AdminTabs({ items }: { items: AdminTabItem[] }) {
  const pathname = usePathname();
  return (
    <div className="-mt-2 flex flex-wrap gap-1 border-b border-gray-200">
      {items.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
