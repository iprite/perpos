"use client";

/**
 * TablePager — แถบแบ่งหน้ามาตรฐาน "ตัวเดียวของทั้งแอป" (ดู DESIGN.md §5.1)
 *
 * ทุกตารางที่รายการอาจยาวเกินหน้าจอต้องมีแถบนี้ และต้อง**หน้าตาเหมือนกันหมด** —
 * ห้ามประกอบปุ่ม ‹ › / "ก่อนหน้า–ถัดไป" เองอีก. เลือก 1 ใน 3 ท่าตามที่มาของข้อมูล:
 *
 *   1) ข้อมูลอยู่ในมือครบแล้ว (client filter)      → `usePagination` + `<TablePager>`
 *   2) fetch ทีละหน้าจาก API (client component)    → `<ControlledTablePager>`
 *   3) หน้า SSR ที่ page อยู่ใน searchParams        → `<LinkTablePager>`
 *
 * ท่าที่ 1 — ใช้คู่กับ `usePagination` เสมอ:
 *
 *   const pager = usePagination(filteredRows);          // default 10 แถว/หน้า
 *   ...
 *   {pager.rows.map(row => <TableRow … />)}
 *   ...
 *   <TablePager pager={pager} />
 *
 * กติกา:
 * - ส่ง "แถวที่ผ่านตัวกรองแล้ว" เข้า usePagination เสมอ — ไม่ใช่ raw list
 *   (ไม่งั้นตัวเลข "แสดง x–y จาก N" จะโกหก)
 * - หน้าจะรีเซ็ตกลับหน้า 1 อัตโนมัติเมื่อ "จำนวนแถวเปลี่ยน" (= เปลี่ยนตัวกรอง/โหลดใหม่)
 *   ถ้าตัวกรองเปลี่ยนแล้วจำนวนแถวบังเอิญเท่าเดิม ให้ส่ง `resetKey` เพิ่ม
 * - ซ่อนตัวเองเมื่อมีหน้าเดียว — ไม่ต้องใส่เงื่อนไข `{rows.length > 0 && …}` เอง
 *
 * หมายเหตุ: นี่คือ paging ฝั่ง client เท่านั้น — ถ้า list มาจาก PostgREST ที่อาจถูกตัด
 * 1,000 แถว ต้องจัดการ `truncated` ที่ชั้น fetch ก่อน (ดู lib/accounting/paging.ts)
 */

import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PaginationState<T> = {
  /** แถวของหน้าปัจจุบัน */
  rows: T[];
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  /** จำนวนแถวทั้งหมด (หลังกรอง) */
  total: number;
  totalPages: number;
  /** ลำดับแถวแรกของหน้านี้ (เริ่มที่ 1) — 0 เมื่อไม่มีแถว */
  from: number;
  /** ลำดับแถวสุดท้ายของหน้านี้ */
  to: number;
};

export function usePagination<T>(
  rows: T[],
  opts?: {
    pageSize?: number;
    /** ค่าที่เปลี่ยนแล้วต้องเด้งกลับหน้า 1 (เช่นคำค้น/แท็บ) — จำนวนแถวถูกเฝ้าให้อยู่แล้ว */
    resetKey?: unknown;
  },
): PaginationState<T> {
  const pageSize = opts?.pageSize ?? 10;
  const [page, setPage] = useState(1);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ตัวกรองเปลี่ยน → กลับหน้าแรก (กันค้างอยู่หน้าที่ไม่มีแถวแล้ว)
  const resetKey = opts?.resetKey;
  useEffect(() => {
    setPage(1);
  }, [total, resetKey]);

  // กันหน้าเกินช่วง แม้ resetKey จะยังไม่ทันขยับ
  const current = Math.min(page, totalPages);
  const paged = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize],
  );

  return {
    rows: paged,
    page: current,
    setPage,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
  };
}

/** เลขหน้าแบบย่อ: 1 … 4 5 6 … 20 */
function pageItems(page: number, totalPages: number): (number | "ellipsis")[] {
  return Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
      acc.push(p);
      return acc;
    }, []);
}

/**
 * PagerBar — เปลือกหน้าตาเดียวของทุกแถบแบ่งหน้า (internal)
 *
 * ทั้งสามท่าต่างกันแค่ "กดแล้วเกิดอะไร" — หน้าตาต้องออกมาจากที่นี่ที่เดียวเท่านั้น
 * `renderPage` คืน element ของปุ่มเลขหน้า/ลูกศร (ปุ่ม onClick หรือ Link แล้วแต่ท่า)
 */
function PagerBar({
  page,
  totalPages,
  from,
  to,
  total,
  unit,
  className,
  renderStep,
  renderPage,
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  unit: string;
  className?: string;
  renderStep: (target: number, dir: "prev" | "next", disabled: boolean) => React.ReactNode;
  renderPage: (target: number, active: boolean) => React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between px-1 ${className ?? ""}`}>
      <p className="text-xs text-gray-500">
        แสดง {from.toLocaleString("th-TH")}–{to.toLocaleString("th-TH")} จาก{" "}
        {total.toLocaleString("th-TH")} {unit}
      </p>
      <div className="flex items-center gap-1">
        {renderStep(Math.max(1, page - 1), "prev", page <= 1)}
        {pageItems(page, totalPages).map((item, idx) =>
          item === "ellipsis" ? (
            <span key={`e${idx}`} className="px-1 text-xs text-gray-400">
              …
            </span>
          ) : (
            <span key={item}>{renderPage(item, item === page)}</span>
          ),
        )}
        {renderStep(Math.min(totalPages, page + 1), "next", page >= totalPages)}
      </div>
    </div>
  );
}

const STEP_ICON = {
  prev: <ChevronLeft className="h-4 w-4" />,
  next: <ChevronRight className="h-4 w-4" />,
} as const;
const STEP_LABEL = { prev: "หน้าก่อนหน้า", next: "หน้าถัดไป" } as const;

/** ท่าที่ 1 — client-side paging (คู่กับ `usePagination`) */
export function TablePager<T>({
  pager,
  /** คำเรียกหน่วยของแถว เช่น "รายการ" (default) / "คน" / "เอกสาร" */
  unit = "รายการ",
  /** แสดงแถบไว้แม้มีหน้าเดียว (ปกติจะซ่อน) */
  alwaysShow = false,
  className,
}: {
  pager: PaginationState<T>;
  unit?: string;
  alwaysShow?: boolean;
  className?: string;
}) {
  const { page, setPage, total, totalPages, from, to } = pager;
  if (total === 0) return null;
  if (totalPages <= 1 && !alwaysShow) return null;

  return (
    <PagerBar
      page={page}
      totalPages={totalPages}
      from={from}
      to={to}
      total={total}
      unit={unit}
      className={className}
      renderStep={(target, dir, disabled) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPage(target)}
          disabled={disabled}
          className="h-8 w-8"
          aria-label={STEP_LABEL[dir]}
        >
          {STEP_ICON[dir]}
        </Button>
      )}
      renderPage={(target, active) => (
        <Button
          variant={active ? "default" : "ghost"}
          size="icon"
          onClick={() => setPage(target)}
          className="h-8 w-8 text-xs"
          aria-current={active ? "page" : undefined}
        >
          {target}
        </Button>
      )}
    />
  );
}

/**
 * ท่าที่ 2 — ControlledTablePager: หน้า client ที่ fetch ทีละหน้าจาก API
 *
 *   <ControlledTablePager page={page} pageSize={LIMIT} total={total} onPageChange={load} />
 *
 * `total` ต้องเป็นยอด "ทั้งหมดที่ตรงเงื่อนไข" ที่ API คืนมา (ไม่ใช่จำนวนแถวของหน้านี้)
 */
export function ControlledTablePager({
  page,
  pageSize,
  total,
  onPageChange,
  unit = "รายการ",
  /** true ระหว่างรอ fetch — ปิดปุ่มกันกดรัว */
  loading = false,
  alwaysShow = false,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  unit?: string;
  loading?: boolean;
  alwaysShow?: boolean;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  if (totalPages <= 1 && !alwaysShow) return null;

  return (
    <PagerBar
      page={page}
      totalPages={totalPages}
      from={(page - 1) * pageSize + 1}
      to={Math.min(page * pageSize, total)}
      total={total}
      unit={unit}
      className={className}
      renderStep={(target, dir, disabled) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(target)}
          disabled={disabled || loading}
          className="h-8 w-8"
          aria-label={STEP_LABEL[dir]}
        >
          {STEP_ICON[dir]}
        </Button>
      )}
      renderPage={(target, active) => (
        <Button
          variant={active ? "default" : "ghost"}
          size="icon"
          onClick={() => onPageChange(target)}
          disabled={loading}
          className="h-8 w-8 text-xs"
          aria-current={active ? "page" : undefined}
        >
          {target}
        </Button>
      )}
    />
  );
}

/**
 * ท่าที่ 3 — LinkTablePager: หน้า SSR ที่ page อยู่ใน searchParams
 *
 *   <LinkTablePager page={page} pageSize={limit} total={total} query={{ status, type }} />
 *
 * `query` = ตัวกรองอื่นที่ต้องคงไว้ (ค่าว่าง/undefined จะถูกตัดทิ้ง) — `page` ถูกใส่ให้เอง
 * (หน้า 1 ไม่ใส่ `page` ใน URL เพื่อให้ลิงก์สะอาด)
 */
export function LinkTablePager({
  page,
  pageSize,
  total,
  query,
  basePath,
  unit = "รายการ",
  alwaysShow = false,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  query?: Record<string, string | number | undefined | null>;
  /** ปกติไม่ต้องส่ง — ลิงก์เป็น relative query string ของหน้าปัจจุบัน */
  basePath?: string;
  unit?: string;
  alwaysShow?: boolean;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  if (totalPages <= 1 && !alwaysShow) return null;

  const hrefFor = (target: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    if (target > 1) qs.set("page", String(target));
    const s = qs.toString();
    return `${basePath ?? ""}${s ? `?${s}` : basePath ? "" : "?"}`;
  };

  return (
    <PagerBar
      page={page}
      totalPages={totalPages}
      from={(page - 1) * pageSize + 1}
      to={Math.min(page * pageSize, total)}
      total={total}
      unit={unit}
      className={className}
      renderStep={(target, dir, disabled) =>
        disabled ? (
          <Button
            variant="ghost"
            size="icon"
            disabled
            className="h-8 w-8"
            aria-label={STEP_LABEL[dir]}
          >
            {STEP_ICON[dir]}
          </Button>
        ) : (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={STEP_LABEL[dir]}
          >
            <Link href={hrefFor(target)} scroll={false}>
              {STEP_ICON[dir]}
            </Link>
          </Button>
        )
      }
      renderPage={(target, active) => (
        <Button
          asChild
          variant={active ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8 text-xs"
          aria-current={active ? "page" : undefined}
        >
          <Link href={hrefFor(target)} scroll={false}>
            {target}
          </Link>
        </Button>
      )}
    />
  );
}
