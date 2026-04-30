"use client";

import cn from "@core/utils/class-names";
import { PiMagnifyingGlassBold } from "react-icons/pi";

export default function TableSearch({
  value,
  onChange,
  placeholder = "ค้นหา...",
  disabled,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full md:w-64", className)}>
      <PiMagnifyingGlassBold className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400",
          "focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
        )}
      />
    </div>
  );
}
