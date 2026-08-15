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
        // โฟกัสต้องเหมือน <Input> เป๊ะ: ขอบเข้มขึ้น + วงจาง ๆ ติดขอบ
        // (เดิมเป็น ring-blue-500 + ring-offset-2 → blue ถูก map เป็น charcoal
        //  กลายเป็นวงดำหนามีช่องว่างขาวคั่น ดูเป็นกรอบสองชั้น ไม่เข้าชุดกับช่องอื่น)
        "flex w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
