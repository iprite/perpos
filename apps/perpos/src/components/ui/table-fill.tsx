"use client";

import * as React from "react";

/**
 * กล่อง scroll ของ `<Table fillViewport>` — ยืดสูงจนสุดขอบล่างของ browser
 *
 * แยกไฟล์ + "use client" เพราะ `<Table>` ถูกใช้ใน Server Component ด้วย (หน้า SSR)
 * ถ้าเอา hook ไปไว้ใน table.tsx ตรง ๆ จะพังทั้งไฟล์ ("useRef only works in Client Components")
 */
export function TableFillScroller({
  reserve,
  className,
  children,
}: {
  /** พื้นที่ (px) ที่กันไว้ให้ของใต้ตาราง — แถบแบ่งหน้า + ระยะขอบล่าง */
  reserve: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = React.useState<number | null>(null);

  // วัดจากตำแหน่งจริงของตาราง — ของเหนือตารางยุบ/กางได้ (แถบตัวกรอง) ก็ยังพอดีเสมอ
  // ตั้งใจไม่ใส่ dependency array: ต้องวัดใหม่ทุก render (ของเหนือตารางเปลี่ยนความสูงได้)
  // ไม่วนไม่จบเพราะ setState เฉพาะตอนค่าต่างเกิน 1px → รอบถัดไปค่าเท่าเดิม React bail out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const next = Math.max(200, window.innerHeight - top - reserve);
      setMaxHeight((prev) => (prev !== null && Math.abs(prev - next) < 1 ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  return (
    <div ref={ref} className={className} style={maxHeight !== null ? { maxHeight } : undefined}>
      {children}
    </div>
  );
}
