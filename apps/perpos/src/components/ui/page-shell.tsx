'use client';

/**
 * PageShell — เปลือกหน้า (page shell) มาตรฐานของ "ทุกหน้า" ในแอป
 *
 * เป้าหมาย: ให้ทุกโมดูล (admin · ผู้ช่วย AI · ERP/biz) มี container width +
 * header pattern ชุดเดียวกัน แทนการที่แต่ละหน้าเขียน max-w / padding / หัวข้อ
 * เองคนละแบบ (text-xl/2xl, font-bold/semibold, slate/gray, <div>/<h1> ปนกัน)
 *
 * ⚠️ HydrogenLayout ใส่ padding รอบนอกให้แล้ว (px-4 md:px-5 lg:px-6) — หน้าลูก
 * จึง **ไม่ต้อง** ใส่ px-6 py-6 / p-4 md:p-6 ซ้ำอีก (double padding) ให้ห่อด้วย
 * <PageShell> แล้วปล่อยให้มันคุม container/spacing ให้
 *
 * การใช้งาน:
 *   <PageShell
 *     title="เงินเดือน"
 *     description="จัดการรอบจ่ายและสลิปพนักงาน"
 *     icon={<Wallet className="h-6 w-6" />}
 *     actions={<Button>เพิ่มรอบจ่าย</Button>}
 *   >
 *     ...content...
 *   </PageShell>
 *
 * width:
 *   "narrow"  (max-w-3xl)        — ฟอร์มแคบ, หน้า settings เดี่ยว
 *   "default" (max-w-7xl/1280px) — หน้าทั่วไป, การ์ดสรุป
 *   "wide"    (max-w-screen-2xl) — ตารางหลายคอลัมน์
 *   "full"    (max-w-none)       — แดชบอร์ด/ตารางที่กินพื้นที่เต็มจอ
 */

import React from 'react';

export type PageShellWidth = 'narrow' | 'default' | 'wide' | 'full';

const WIDTH_CLASS: Record<PageShellWidth, string> = {
  narrow:  'max-w-3xl',
  default: 'max-w-7xl',
  wide:    'max-w-screen-2xl',
  full:    'max-w-none',
};

export function PageShell({
  title,
  description,
  icon,
  actions,
  tabs,
  width = 'default',
  children,
}: {
  /** เว้นว่างได้ — สำหรับหน้า detail ที่มี header การ์ดของตัวเอง (จะได้แค่ container/padding มาตรฐาน) */
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** แถบแท็บใต้ header (optional) — ส่ง element ที่ตกแต่งเองมาเลย */
  tabs?: React.ReactNode;
  width?: PageShellWidth;
  children: React.ReactNode;
}) {
  const hasHeader = Boolean(title || icon || description || actions);
  return (
    <div className={`mx-auto w-full ${WIDTH_CLASS[width]} space-y-6 px-1 py-2 sm:px-2 lg:px-3`}>
      {hasHeader && (
        <header className="sticky top-0 z-10 -mx-1 -mt-2 mb-0 flex flex-col gap-3 bg-white px-1 pb-3 pt-4 sm:-mx-2 sm:flex-row sm:items-end sm:justify-between sm:px-2 lg:-mx-3 lg:px-3">
          <div className="min-w-0">
            {title && <h1 className="text-2xl font-semibold leading-tight text-gray-900">{title}</h1>}
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}

      {tabs}

      {children}
    </div>
  );
}

/**
 * PageCard — การ์ดเนื้อหามาตรฐาน (กรอบ + เงาบาง) ใช้ครอบ section/ตาราง
 */
export function PageCard({
  title,
  actions,
  className = '',
  bodyClassName = 'p-5',
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          {title && <div className="text-sm font-semibold text-gray-700">{title}</div>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
