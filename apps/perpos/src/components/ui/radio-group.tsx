"use client";

// RadioGroup — ตัวเลือก "อันใดอันหนึ่ง" ที่เป็น **ข้อเท็จจริงของข้อมูล** ในฟอร์มบันทึกข้อมูล
// (เช่น จด VAT / ไม่ได้จด · ขึ้นทะเบียนประกันสังคม / ไม่ได้ขึ้น)
//
// เลือกใช้ตัวไหน — ดู DESIGN.md §7:
//   <SegmentedControl> = "สลับมุมมอง/โหมด" ที่ผลลัพธ์เปลี่ยนทันที (ตัวกรอง, แท็บ, ฿/%)
//   <RadioGroup>       = "ค่าที่กรอกลงฐานข้อมูล" ในฟอร์ม — ต้องอ่านออกว่ามีกี่ตัวเลือกและเลือกอะไรอยู่
//
// <RadioGroup
//   name="vat"
//   value={vat ? "yes" : "no"}
//   onChange={(v) => setVat(v === "yes")}
//   options={[
//     { value: "yes", label: "จดทะเบียน", hint: "ต้องยื่น ภ.พ.30 ทุกเดือน" },
//     { value: "no",  label: "ไม่ได้จด" },
//   ]}
// />

import type { ReactNode } from "react";
import cn from "@core/utils/class-names";

export type RadioOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** คำอธิบายใต้ label — ใช้เมื่อสองตัวเลือกมีผลต่างกันที่ผู้ใช้ควรรู้ */
  hint?: ReactNode;
  disabled?: boolean;
};

export function RadioGroup<T extends string>({
  name,
  value,
  onChange,
  options,
  /** row (default) = เรียงแนวนอน ตกบรรทัดเองเมื่อไม่พอ · col = เรียงลง */
  direction = "row",
  disabled = false,
  className,
  ariaLabel,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  direction?: "row" | "col";
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-x-5 gap-y-2",
        direction === "col" ? "flex-col" : "flex-wrap items-start",
        className,
      )}
    >
      {options.map((opt) => {
        const isDisabled = disabled || opt.disabled;
        const checked = opt.value === value;
        return (
          <label
            key={opt.value}
            className={cn(
              "flex items-start gap-2",
              isDisabled ? "cursor-default opacity-60" : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              disabled={isDisabled}
              onChange={() => onChange(opt.value)}
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 appearance-none rounded-full border transition-colors",
                "border-gray-300 bg-white",
                "checked:border-[5px] checked:border-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                !isDisabled && "hover:border-gray-400 checked:hover:border-primary",
              )}
            />
            <span className="min-w-0">
              <span className={cn("block text-sm", checked ? "text-gray-900" : "text-gray-600")}>
                {opt.label}
              </span>
              {opt.hint && <span className="block text-xs text-gray-400">{opt.hint}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
