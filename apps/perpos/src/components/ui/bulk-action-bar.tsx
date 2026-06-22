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
}: {
  count: number;
  onClear: () => void;
  /** ปุ่ม action — วางชิดขวา */
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
        <span className="flex items-center gap-2 pl-1 text-sm text-gray-700">
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
            {count}
          </span>
          เลือกแล้ว
        </span>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-2">{children}</div>
        <button
          type="button"
          title="ยกเลิกการเลือก"
          onClick={onClear}
          className="ml-1 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
