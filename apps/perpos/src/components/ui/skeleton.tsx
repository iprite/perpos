/**
 * Skeleton — placeholder โหลดข้อมูล (ตาม DESIGN.md §9)
 *
 * ใช้ skeleton แทน spinner สำหรับ initial page load / list / table เสมอ
 * (spinner สงวนไว้สำหรับ user-triggered action เท่านั้น)
 *
 * ทุกสีผ่าน palette token (gray ramp) — ไม่ฮาร์ดโค้ด hex
 */

import React from "react";

import cn from "@core/utils/class-names";

/** กล่อง skeleton พื้นฐาน — pulse สีเทาอ่อน (decorative → ซ่อนจาก screen reader) */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-gray-100", className)} />
  );
}

/** ข้อความหลายบรรทัด — บรรทัดสุดท้ายสั้นกว่าเพื่อความเป็นธรรมชาติ */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** แถวการ์ดสรุป KPI (เลียนแบบ <StatCard>) */
export function SkeletonStatCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mt-3 h-7 w-32" />
        </div>
      ))}
    </div>
  );
}

/** ตาราง (เลียนแบบ <Table> — header + rows) */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* header */}
      <div className="flex gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* rows */}
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "max-w-[40%]")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
