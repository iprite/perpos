import * as React from "react";

import cn from "@core/utils/class-names";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "success" | "danger";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-slate-100 text-slate-800",
        variant === "secondary" && "bg-blue-50 text-blue-700",
        variant === "success" && "bg-emerald-50 text-emerald-700",
        variant === "danger" && "bg-red-50 text-red-700",
        className,
      )}
      {...props}
    />
  );
}

/**
 * StatusBadge — ป้ายสถานะกลางตาม DESIGN.md §6
 * ใช้แทน <span className="…rounded-full…"> ที่เขียนมือกระจายอยู่ทุกหน้า
 * tone จับคู่ความหมาย: neutral=ร่าง/ยกเลิก · info=กำลังทำ · success=สำเร็จ ·
 * warning=รอ/ใกล้ครบ · danger=ผิดพลาด/ลบ
 */
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-gray-200 bg-gray-50 text-gray-600",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
