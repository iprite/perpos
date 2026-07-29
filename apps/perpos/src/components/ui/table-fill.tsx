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
  const { ref, height } = useFillViewport<HTMLDivElement>(reserve);

  return (
    <div
      ref={ref}
      className={className}
      style={height !== null ? { maxHeight: height } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * วัดความสูงที่เหลือจากตำแหน่งจริงของ element ถึงขอบล่างของ browser
 * ใช้กับของที่ต้อง "สูงสุดแค่ขอบ browser แล้วเลื่อนในตัวเอง" — ตาราง, บอร์ด kanban ฯลฯ
 * ห้ามเดา `calc(100vh - Nrem)` เอง (ของเหนือมันยุบ/กางได้)
 */
export function useFillViewport<T extends HTMLElement>(reserve: number) {
  const ref = React.useRef<T>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  // ตั้งใจไม่ใส่ dependency array: ต้องวัดใหม่ทุก render (ของเหนือเปลี่ยนความสูงได้)
  // ไม่วนไม่จบเพราะ setState เฉพาะตอนค่าต่างเกิน 1px → รอบถัดไปค่าเท่าเดิม React bail out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const next = Math.max(200, window.innerHeight - top - reserve);
      setHeight((prev) => (prev !== null && Math.abs(prev - next) < 1 ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  return { ref, height };
}
