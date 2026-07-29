"use client";

/**
 * FilterBar — แถบตัวกรองมาตรฐานเหนือตาราง/รายการ
 *
 *   <FilterBar>
 *     <FilterSearch value={q} onChange={setQ} placeholder="ค้นหา ชื่อ / รหัสสินค้า" />
 *     <SegmentedControl … />
 *     <CustomSelect className="w-40" … />
 *     <FilterClear onClick={reset} disabled={!hasFilter} />   // ชิดขวาอัตโนมัติ
 *   </FilterBar>
 *
 * ── ทำไมต้องเป็น flex-wrap ไม่ใช่ `flex-col lg:flex-row` ────────────────────
 * `flex-col` + `lg:flex-row` ตัดสินจาก **ความกว้างจอ** ซึ่งไม่รู้ว่าเนื้อหาจริงกว้างแค่ไหน
 * → จอ 1000px ที่มีแค่ช่องค้นหา + pill 2 อัน ก็ยังถูกบังคับให้ซ้อนกัน 3 บรรทัด (ทั้งที่พอ)
 * → พอมีตัวกรอง 6 อันบนจอ 1280px กลับอัดอยู่บรรทัดเดียวจนล้น
 *
 * `flex-wrap` ตัดสินจาก **เนื้อหาพอดีไหมจริง ๆ** — อยู่บรรทัดเดียวจนกว่าจะไม่พอ
 * แล้วค่อยตกทีละตัว ไม่ใช่ตกยกแผง นี่คือกฎที่ถูกต้องสำหรับ "กลุ่มของสั้น ๆ ที่ไม่รู้จำนวนล่วงหน้า"
 *
 * ── กฎความกว้างของลูก (สำคัญ: ผิดข้อนี้ = ตกบรรทัดทั้งที่มีที่ว่าง) ─────────
 * - ช่องค้นหา: **ห้าม `flex-1` เดี่ยว ๆ** — มันจะกินที่ทั้งแถวแล้วดันตัวอื่นตกบรรทัด
 *   ใช้ `FilterSearch` (กว้างพอประมาณ + ยืดได้จำกัด) หรือ `flex-1 min-w-[12rem] max-w-sm`
 * - select/pill: กำหนดความกว้างคงที่ (`w-36`/`w-40`) หรือปล่อยตามเนื้อหา + `shrink-0`
 * - ปุ่มล้างตัวกรอง: ใช้ `<FilterClear>` (ms-auto ดันไปชิดขวาของแถว)
 */

import type { ReactNode } from "react";
import { Filter, Search } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FilterBar({
  children,
  /** ซ่อนไอคอนกรวยนำหน้าแถว */
  hideIcon = false,
  /** ไม่ต้องมีกรอบการ์ด (เมื่อวางในการ์ดอื่นอยู่แล้ว) */
  bare = false,
  className,
}: {
  children: ReactNode;
  hideIcon?: boolean;
  bare?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        !bare && "rounded-xl border border-gray-200 bg-white p-3 shadow-sm",
        className,
      )}
    >
      {!hideIcon && <Filter className="h-4 w-4 shrink-0 text-gray-400" />}
      {children}
    </div>
  );
}

/** ช่องค้นหาในแถบตัวกรอง — กว้างพอใช้ ยืดได้แต่ไม่กินทั้งแถว */
export function FilterSearch({
  value,
  onChange,
  placeholder = "ค้นหา",
  className,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** กด Enter ในช่องค้นหา (สำหรับหน้าที่ค้นหาแบบ server-side) */
  onEnter?: () => void;
}) {
  return (
    <div className={cn("relative w-full min-w-[12rem] flex-1 sm:w-64 sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        className="pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={
          onEnter
            ? (e) => {
                if (e.key === "Enter") onEnter();
              }
            : undefined
        }
      />
    </div>
  );
}

/** ปุ่มล้างตัวกรอง — ชิดขวาสุดของแถวเสมอ */
export function FilterClear({
  onClick,
  disabled,
  children = "ล้างตัวกรอง",
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled} className="ms-auto">
      {children}
    </Button>
  );
}
