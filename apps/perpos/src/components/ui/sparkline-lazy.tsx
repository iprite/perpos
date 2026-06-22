"use client";

/**
 * Sparkline (lazy) — โหลด recharts เป็น chunk แยกเฉพาะตอนที่ใช้จริง (มี spark)
 * เพื่อไม่ให้ <StatCard> ลาก recharts เข้า bundle ของทุกหน้าที่ใช้การ์ดสรุป
 * ssr:false → กราฟจิ๋วโผล่หลัง hydration (decorative — รับได้)
 */

import dynamic from "next/dynamic";

export const Sparkline = dynamic(() => import("./sparkline").then((m) => m.Sparkline), {
  ssr: false,
});
