/**
 * PageSkeleton — fallback มาตรฐานสำหรับ loading.tsx (App Router)
 *
 * เลียนแบบโครงของ <PageShell> (header h1 + description) + เนื้อหาตาม variant
 * เพื่อให้ skeleton ตรงกับ layout จริง → ไม่เกิด layout shift ตอนข้อมูลมา
 *
 * ใช้ใน loading.tsx เท่านั้น (โชว์ระหว่าง navigation/SSR ของ segment ใหม่)
 */

import React from "react";

import { Skeleton, SkeletonStatCards, SkeletonTable } from "@/components/ui/skeleton";
import { WIDTH_CLASS, type PageShellWidth } from "@/components/ui/page-shell";

type Variant = "dashboard" | "table" | "form";

export function PageSkeleton({
  variant = "dashboard",
  width = "default",
}: {
  variant?: Variant;
  width?: PageShellWidth;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="กำลังโหลด"
      className={`mx-auto w-full ${WIDTH_CLASS[width]} space-y-6 px-1 py-2 sm:px-2 lg:px-3`}
    >
      <span className="sr-only">กำลังโหลด…</span>
      {/* header — จำลอง h1 + description ของ PageShell */}
      <div className="-mx-1 -mt-2 mb-0 flex flex-col gap-3 bg-white px-1 pb-3 pt-4 sm:-mx-2 sm:px-2 lg:-mx-3 lg:px-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {variant === "dashboard" && (
        <>
          <SkeletonStatCards count={3} />
          <SkeletonTable rows={6} cols={4} />
        </>
      )}

      {variant === "table" && <SkeletonTable rows={8} cols={4} />}

      {variant === "form" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
