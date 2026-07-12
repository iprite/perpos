"use client";

// mobile-frame.tsx — กรอบมือถือจำลอง (สำหรับหน้า line-preview LIFF)
// ⚠️ นี่คือ "UI แอปจริง" (ที่ลูกค้าเห็นในเว็บ LINE) — ห้าม hex ทั้งไฟล์ ใช้ Tailwind palette เท่านั้น
// (ต่างจาก flex-preview.tsx ที่จำลอง Flex render นอก Tailwind)
// interactive element = Button component หรือ div role="button" (ตาม pattern locked ใน tee-times) — ไม่มี raw button element

import type { ReactNode } from "react";
import { ChevronLeft, MoreHorizontal, X } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";

/**
 * MobileFrame — เปลือกมือถือ: notch + แถบหัว LINE (ชื่อ OA + back) + พื้นที่เลื่อน + rich menu bar ล่าง
 * children = เนื้อหาที่เลื่อนได้ (h คงที่) · footer = rich menu bar (optional)
 */
export function MobileFrame({
  oaName,
  onBack,
  onClose,
  children,
  footer,
}: {
  oaName: string;
  onBack?: () => void;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="overflow-hidden rounded-[2.5rem] border-8 border-gray-800 bg-white shadow-xl">
        {/* notch */}
        <div className="relative flex h-6 items-center justify-center bg-gray-800">
          <div className="h-1.5 w-20 rounded-full bg-gray-600" />
        </div>

        {/* LINE header bar */}
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
          {onBack ? (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="ย้อนกลับ">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : (
            <span className="h-9 w-9" />
          )}
          <span className="flex-1 truncate text-sm font-semibold text-gray-900">{oaName}</span>
          {onClose ? (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center text-gray-300">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          )}
        </div>

        {/* scroll area */}
        <div className="h-[600px] overflow-y-auto bg-gray-50">{children}</div>

        {/* rich menu bar */}
        {footer && <div className="border-t border-gray-200 bg-white">{footer}</div>}
      </div>
    </div>
  );
}

/** rich menu bar — 3 ปุ่มล่างจอ (div role=button — ตาม pattern locked, Tailwind ไม่ hex) */
export function RichMenuBar({
  items,
}: {
  items: { key: string; label: string; icon: ReactNode; active?: boolean; onClick: () => void }[];
}) {
  return (
    <div className="grid grid-cols-3 divide-x divide-gray-200">
      {items.map((it) => (
        <div
          key={it.key}
          role="button"
          tabIndex={0}
          onClick={it.onClick}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              it.onClick();
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
            it.active ? "bg-gray-100 text-primary" : "text-gray-500 hover:bg-gray-50",
          )}
        >
          <span className={cn(it.active ? "text-primary" : "text-gray-400")}>{it.icon}</span>
          {it.label}
        </div>
      ))}
    </div>
  );
}
