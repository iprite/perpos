import { forwardRef, type SelectHTMLAttributes } from "react";
import cn from "@core/utils/class-names";

export const selectCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 transition-colors hover:border-slate-300 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60 disabled:hover:border-slate-200";

const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(selectCls, className)} {...props} />
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
