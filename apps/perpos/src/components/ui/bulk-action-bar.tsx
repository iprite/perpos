"use client";

/**
 * BulkActionBar — แถบลอยด้านล่างเมื่อเลือกหลายแถว (bulk actions)
 *   {sel.count > 0 && (
 *     <BulkActionBar count={sel.count} onClear={sel.clear}>
 *       <Button size="sm" onClick={…}>ต่อ trial +30 วัน</Button>
 *     </BulkActionBar>
 *   )}
 */

import { X } from "lucide-react";

export function BulkActionBar({
  count,
  onClear,
  children,
  selectedLabel = "เลือกแล้ว",
  clearLabel = "ยกเลิกการเลือก",
}: {
  count: number;
  onClear: () => void;
  /** ปุ่ม action — วางชิดขวา */
  children: React.ReactNode;
  /** ป้าย "เลือกแล้ว" — ส่งเข้ามาเมื่ออยู่ในโซนที่มีภาษาของตัวเอง (เว็บเมล) */
  selectedLabel?: string;
  clearLabel?: string;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-3 sm:px-4">
      {/* จอแคบใส่ปุ่มไม่หมด → **เลื่อนแนวนอน** ไม่ใช่ตัดบรรทัด (ตัวหนังสือในปุ่มเคยล้นออกนอกกรอบ)
          ตัวนับกับปุ่มปิดตรึงไว้เสมอ — มีแต่แถวปุ่มที่เลื่อน */}
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg sm:gap-3">
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap pl-1 text-sm text-gray-700">
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
            {count}
          </span>
          {selectedLabel}
        </span>
        <div className="h-5 w-px shrink-0 bg-gray-200" />
        <div
          className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
          style={{ scrollbarWidth: "none" }}
        >
          {children}
        </div>
        <button
          type="button"
          title={clearLabel}
          aria-label={clearLabel}
          onClick={onClear}
          className="ml-1 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
