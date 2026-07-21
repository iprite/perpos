import * as React from "react";

import cn from "@core/utils/class-names";

/**
 * Textarea — กล่องข้อความหลายบรรทัดมาตรฐาน (คู่กับ <Input>)
 * ใช้แทน raw <textarea> ทุกที่ · สไตล์/โฟกัสตรงกับ Input (palette-safe)
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => {
  return (
    <textarea
      rows={rows}
      className={cn(
        "flex w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
