import { forwardRef, type SelectHTMLAttributes } from "react";
import cn from "@core/utils/class-names";

export const selectCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none disabled:opacity-60";

const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(selectCls, className)} {...props} />
  )
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
