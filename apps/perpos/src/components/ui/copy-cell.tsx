"use client";

/**
 * CopyCell / CopyInline — เซลล์/ชิป ที่ก็อปค่า (เช่น ID, UUID) ได้ในคลิกเดียว
 *
 * ใช้ในตาราง: <TableCell><CopyInline value={row.id} /></TableCell>
 * แสดงไอคอน copy ตอน hover → กดแล้วเปลี่ยนเป็น check 2 วิ (DESIGN.md §12)
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import cn from "@core/utils/class-names";
import { copyText } from "@/utils/clipboard";

export function CopyInline({
  value,
  label,
  className,
  mono = true,
}: {
  /** ค่าที่จะก็อป */
  value: string;
  /** ข้อความที่แสดง (default = value) */
  label?: React.ReactNode;
  className?: string;
  /** แสดงแบบ font-mono (เหมาะกับ ID/UUID) */
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="คัดลอก"
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(value)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
      className={cn(
        "group/copy inline-flex max-w-full items-center gap-1.5 rounded text-left transition-colors hover:text-gray-700",
        mono && "font-mono",
        className,
      )}
    >
      <span className="truncate">{label ?? value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-opacity group-hover/copy:text-gray-500" />
      )}
    </button>
  );
}
