"use client";

// nav.tsx (production) — AccountingShell (เปลือกหน้าทุกหน้า) = PageShell wrapper อย่างเดียว
//   navigation = global sidebar (menu-items.tsx, 2 กลุ่ม หน้าบ้าน/หลังบ้าน) เหมือน hrm/tmc —
//   ไม่ render in-page sidebar (กัน nav ซ้อน) · role lens = page guard (NoAccess) + write-gating ที่หน้า
//
// import: import { AccountingShell } from "../_components/nav";

import React from "react";
import { PageShell } from "@/components/ui/page-shell";

/**
 * AccountingShell — เปลือกหน้ามาตรฐานของทุกหน้า accounting (production)
 * PageShell (container/header/title/description/actions/tabs) เท่านั้น · ไม่มี sidebar ในหน้า
 * (navigation มาจาก global sidebar เหมือน hrm/tmc)
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
  /** แท็บเสริมใต้ header */
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
      tabs={tabs}
    >
      <div className="space-y-5">{children}</div>
    </PageShell>
  );
}
