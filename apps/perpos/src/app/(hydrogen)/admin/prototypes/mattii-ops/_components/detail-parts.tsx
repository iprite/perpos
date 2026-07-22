// detail-parts.tsx — ชิ้นส่วนหน้ารายละเอียดที่ใช้ซ้ำทุกหน้า (module-reviewer P4a nice-3/4)
// ห้ามก็อป pattern พวกนี้ไปเขียนเองในหน้า — import จาก "../_components" เสมอ

import type { ReactNode } from "react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";

/** คู่ label + ค่า (2 บรรทัด) ใช้ในการ์ด/แท็บรายละเอียดทุกหน้า */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm text-gray-900">{children}</div>
    </div>
  );
}

/**
 * หัวข้อเหนือตาราง/บล็อกเนื้อหา — ใช้แทนการห่อตารางในการ์ดอีกชั้น
 * (DESIGN §5 ข้อ 7: Table เป็นการ์ดในตัวอยู่แล้ว ห้าม card ซ้อน card)
 */
export function SectionHeading({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
      <div className="text-sm font-semibold text-gray-900">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * แถบตัวกรองมาตรฐานของหน้า list — **การ์ดเดียวของทั้งโมดูล** (ux-reviewer b6: ห้ามมีแถบตัวกรอง 2 หน้าตา)
 * โครง 3 แถว (แถวไหนไม่มีข้อมูลก็ไม่เรนเดอร์):
 *   1) `toolbar` — มุมบนของแถบ สำหรับ SegmentedControl สลับมุมมอง (ส่ง 2 ชิ้น = ซ้าย/ขวาอัตโนมัติ)
 *   2) `children` — ช่องกรอง (search / select / date)
 *   3) `resultText` ซ้าย + ปุ่ม "ล้างตัวกรอง" ขวา (โชว์เมื่อส่ง `onClear` = มีตัวกรองทำงานอยู่)
 */
export function FilterBar({
  children,
  toolbar,
  onClear,
  resultText,
  className,
}: {
  children: ReactNode;
  /** แถวบนของแถบ — เช่น SegmentedControl สลับตาราง/บอร์ด */
  toolbar?: ReactNode;
  onClear?: () => void;
  resultText?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm",
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3">{toolbar}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {resultText || onClear ? (
        <div className="flex flex-wrap items-center gap-3">
          {resultText ? (
            <span className="text-xs tabular-nums text-gray-500">{resultText}</span>
          ) : null}
          {onClear ? (
            <Button variant="ghost" size="sm" onClick={onClear} className="ms-auto text-gray-600">
              ล้างตัวกรอง
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
