"use client";

/**
 * TablePager — แถบแบ่งหน้ามาตรฐานใต้ตาราง (client-side paging)
 *
 * ใช้คู่กับ `usePagination` เสมอ:
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

import { useEffect, useMemo, useState } from "react";
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
    <div className={`flex items-center justify-between px-1 ${className ?? ""}`}>
      <p className="text-xs text-gray-500">
        แสดง {from}–{to} จาก {total} {unit}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="h-8 w-8"
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pageItems(page, totalPages).map((item, idx) =>
          item === "ellipsis" ? (
            <span key={`e${idx}`} className="px-1 text-xs text-gray-400">
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? "default" : "ghost"}
              size="icon"
              onClick={() => setPage(item)}
              className="h-8 w-8 text-xs"
            >
              {item}
            </Button>
          ),
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="h-8 w-8"
          aria-label="หน้าถัดไป"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
