// baseline.ts — ตัวเลข "ก่อนมีระบบ" สำหรับพรีเซน before/after (Contract v3 §3.22 mattii_benchmarks)
//
// สำคัญ: ค่า baseline มาจาก `benchmark` (benchmarks.ts, entity mattii_benchmarks — singleton ต่อ org)
// เป็น "ค่าประมาณการจากเจ้าของร้าน" (ดู source_note) ไม่ใช่ข้อมูลวัดจริงจากระบบเก่า (ร้าน Mattii ไม่มีระบบเก่า
// เก็บ log ไว้ให้ย้อนดู) — ห้ามนำไปอ้างอิงเป็นสถิติทางการ ใช้เพื่อ "เล่าเรื่อง" ในการนำเสนอเท่านั้น
//
// ค่า "ปัจจุบัน" (current) ต้องคำนวณจาก fixture จริงเสมอผ่าน metrics.ts (แหล่งเดียว) — ห้าม hardcode
// ยกเว้น 2 ตัวที่ contract ไม่มี field ข้อมูลให้คำนวณ (reply_time / orders_per_month — ดูคอมเมนต์ตรงจุด)
import { benchmark } from "./benchmarks";
import { avgCfWaitDays, avgLeadTimeDays, lateRatePercent, reprintRatePercent } from "./metrics";
import type { MattiiOrder } from "./types";

// contract ไม่มี field เก็บเวลาใช้งานจริงต่อข้อความ (เช่น "เริ่ม-จบตอบแชท") จึงคำนวณจาก fixture ไม่ได้
// คงค่านี้ไว้เป็นค่าประมาณการปัจจุบัน (ตามเป้าที่ธุรกิจตั้ง — Sale ตอบเร็วขึ้นเพราะกล่องแชทรวมที่เดียว
// ไม่ต้องสลับแอป 3 ตัว) — ไม่ใช่ hardcode ผลลัพธ์ metric ที่ควรคำนวณได้จาก orders
const CURRENT_REPLY_TIME_MINUTES = 12;

export interface BaselineComparisonRow {
  key: string;
  label: string;
  unit: string;
  before: number;
  after: number | null; // null = ไม่มีข้อมูลให้คำนวณ "ปัจจุบัน" ใน fixture (ดู note)
  note?: string;
  /** true = ค่ายิ่งน้อยยิ่งดี — ใช้เลือกทิศลูกศร improve/worse ใน UI */
  lowerIsBetter: boolean;
}

/** ค่าปัจจุบันจริงจาก fixture (ห้าม hardcode) — คำนวณผ่าน metrics.ts ทุกตัวที่ทำได้
 *  รับ `ordersSrc` optional เพื่อให้หน้าที่ mutate order state ในหน่วยความจำ (เช่น /orders, /board)
 *  ส่งชุดข้อมูล "สด" เข้ามาคิดด้วยสูตรเดียวกันได้ — เหมือน pattern src ของ metrics.ts */
export function currentValues(ordersSrc?: MattiiOrder[]) {
  return {
    leadTimeDays: avgLeadTimeDays(ordersSrc),
    cfWaitDays: avgCfWaitDays(ordersSrc),
    reprintRatePercent: reprintRatePercent(ordersSrc),
    lateRatePercent: lateRatePercent(ordersSrc),
  };
}

/** ตาราง before/after พร้อมใช้ — หน้า "ภาพรวม" หยิบไปแสดงตรง ๆ ได้เลย */
export function baselineComparison(ordersSrc?: MattiiOrder[]): BaselineComparisonRow[] {
  const current = currentValues(ordersSrc);
  return [
    {
      key: "lead_time_days",
      label: "เวลารับออเดอร์ → ส่งถึงมือลูกค้าเฉลี่ย",
      unit: "วัน",
      before: benchmark.lead_time_baseline_days,
      after: current.leadTimeDays,
      lowerIsBetter: true,
    },
    {
      key: "cf_wait_days",
      label: "เวลารอลูกค้ายืนยันลาย (CF) เฉลี่ย",
      unit: "วัน",
      before: benchmark.cf_wait_baseline_days,
      after: current.cfWaitDays,
      lowerIsBetter: true,
    },
    {
      key: "reprint_rate_percent",
      label: "อัตราพิมพ์ซ้ำจาก QC ไม่ผ่าน",
      unit: "%",
      before: benchmark.reprint_rate_baseline,
      after: current.reprintRatePercent,
      lowerIsBetter: true,
    },
    {
      key: "late_rate_percent",
      label: "อัตราส่งช้ากว่ากำหนด",
      unit: "%",
      before: benchmark.late_rate_baseline,
      after: current.lateRatePercent,
      lowerIsBetter: true,
    },
    {
      key: "reply_time_minutes",
      label: "เวลาตอบแชทลูกค้าเฉลี่ย",
      unit: "นาที",
      before: benchmark.reply_time_baseline_minutes,
      after: CURRENT_REPLY_TIME_MINUTES,
      note: "ไม่มี field เก็บเวลาใช้งานจริงต่อข้อความในสัญญาข้อมูล (contract) จึงเป็นค่าประมาณการ ไม่ได้คำนวณจาก fixture โดยตรงเหมือน 4 ตัวข้างบน",
      lowerIsBetter: true,
    },
    {
      key: "orders_per_month",
      label: "จำนวนออเดอร์ต่อเดือน",
      unit: "ออเดอร์",
      before: benchmark.orders_per_month_baseline,
      after: null,
      note: "fixture เป็นชุดข้อมูลตัวอย่าง (snapshot ~1 เดือน, ไม่ใช่ log ยอดขายจริงทั้งเดือน) จึงไม่ใช้จำนวนออเดอร์ใน fixture มาเทียบเป็น 'ต่อเดือน' ตรง ๆ — โชว์เฉพาะ baseline",
      lowerIsBetter: false,
    },
  ];
}
