"use client";

// SegmentedControl (Pill) — มาตรฐานตัวเลือก 2–3 อย่างที่ "ต้องเลือกอันใดอันหนึ่ง" (mutually exclusive)
// ใช้แทนปุ่มคู่/กลุ่มปุ่ม toggle ทุกที่ที่มีตัวเลือก 2–3 อย่าง (เช่น ฿/%, รายรับ/รายจ่าย, สินค้า/บริการ)
// ต้นแบบดีไซน์: workspace switcher (Admin/Suite/Flow) ใน layouts/hydrogen/header-center.tsx
//
// <SegmentedControl
//   value={kind}
//   onChange={setKind}
//   options={[
//     { value: "income", label: "รายรับ", icon: <ArrowDown className="h-4 w-4" /> },
//     { value: "expense", label: "รายจ่าย" },
//   ]}
// />
//
// ── ขนาด: เลือกตาม "บริบทที่วาง" ไม่ใช่ตามความชอบ ───────────────────────────
//   sm (default) — ตัวกรอง / แท็บ / สลับมุมมองในหน้า  ← ใช้กรณีนี้บ่อยที่สุด
//   form         — ตัวเลือก yes/no ในฟอร์ม (h-8) เตี้ยกว่าช่องกรอกนิดหน่อย ไม่แย่งสายตา
//   md           — เป็น form control ในฟอร์ม (สูง h-9 เท่า Input/CustomSelect ที่อยู่แถวเดียวกัน)
//   xs           — inline ในแถวตาราง / ช่องแคบ
// ไอคอนถูกย่อให้พอดีขนาดอัตโนมัติ — ผู้เรียกส่ง h-4 w-4 มาได้เลย ไม่ต้องปรับเอง

import type { ReactNode } from "react";
import cn from "@core/utils/class-names";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** override active background (เช่น "bg-green-600" สำหรับ semantic) — default = bg-primary (charcoal) */
  activeClassName?: string;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  fullWidth = false,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** sm = ตัวกรอง/แท็บ (default) · form = yes/no ในฟอร์ม (h-8) · md = คู่กับ Input (h-9) · xs = inline ในตาราง */
  size?: "xs" | "sm" | "form" | "md";
  /** กระจายเต็มความกว้าง (แต่ละตัวเลือกกว้างเท่ากัน) */
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  // ไอคอนย่อตามขนาด — override ค่าที่ผู้เรียกส่งมา (ส่วนใหญ่ส่ง h-4 w-4 ติดมาเสมอ)
  const itemPad =
    size === "xs"
      ? "h-6 gap-1 px-2 text-[11px] [&_svg]:h-3 [&_svg]:w-3"
      : size === "sm"
        ? "h-7 gap-1 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5"
        : size === "form"
          ? "h-8 gap-1.5 px-3 text-sm [&_svg]:h-4 [&_svg]:w-4"
          : "h-9 gap-1.5 px-3 text-sm [&_svg]:h-4 [&_svg]:w-4";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-gray-200 bg-gray-50 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // w-fit กัน flex/grid parent ยืดให้เต็มแถว (align-items: stretch) — pill ต้องกว้างเท่าเนื้อหาเสมอ
        fullWidth ? "flex w-full" : "w-fit",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition-colors [&_svg]:shrink-0",
              itemPad,
              fullWidth && "flex-1",
              active
                ? cn("text-white shadow-sm", opt.activeClassName ?? "bg-primary")
                : "text-gray-600 hover:bg-gray-100",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
