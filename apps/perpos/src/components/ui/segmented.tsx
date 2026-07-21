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
  size = "md",
  fullWidth = false,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "xs" | "sm" | "md";
  /** กระจายเต็มความกว้าง (แต่ละตัวเลือกกว้างเท่ากัน) */
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const itemPad =
    size === "xs"
      ? "h-6 gap-0.5 px-2 text-[11px]"
      : size === "sm"
        ? "h-7 gap-1 px-2.5 text-xs"
        : "h-9 gap-1.5 px-3.5 text-sm";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-gray-50 p-0.5",
        fullWidth && "flex w-full",
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
              "inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium transition-colors",
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
