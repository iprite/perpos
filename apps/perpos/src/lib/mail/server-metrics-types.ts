/**
 * ชนิดข้อมูลที่ทั้งฝั่งเซิร์ฟเวอร์และหน้าเว็บใช้ร่วมกัน — ไฟล์นี้ต้องไม่ import อะไรที่เป็น server-only
 * (ดูเหตุผลใน [server-metrics-calc.ts](./server-metrics-calc.ts))
 */

import type { MailServerSample } from "./server-metrics-calc";

export interface MailServerMetrics {
  latest: MailServerSample | null;
  /** เรียงเก่า→ใหม่ พร้อมพล็อตกราฟ */
  series: MailServerSample[];
  /** ผลตรวจจากข้างนอก (scheduler) — ปัญหาที่ยังค้างอยู่ ณ รอบล่าสุด */
  lastCheckAt: string | null;
  issues: Record<string, string>;
  heartbeatAt: string | null;
}
