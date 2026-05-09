import * as React from "react";

import cn from "@core/utils/class-names";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "success" | "danger";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
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

