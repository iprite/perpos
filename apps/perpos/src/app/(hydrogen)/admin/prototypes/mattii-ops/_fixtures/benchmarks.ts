// benchmarks.ts — mattii_benchmarks (Contract v3 §3.22) — singleton ต่อ org
// ค่า "ก่อนมีระบบ" ที่ architect เคาะกับเจ้าของร้าน (ก.ค. 2569) ใช้คู่กับค่าปัจจุบันที่คำนวณจาก fixture
// จริงใน metrics.ts/baseline.ts — ห้ามแก้ตัวเลขที่นี่โดยไม่ผ่าน architect (แหล่งเดียวของ org)
//
// orchestrator decision (2026-07-23): reprint_rate_baseline 8.5→18.0 และ cf_wait_baseline_days 2.5→5.0
// เพราะค่าปัจจุบันที่คำนวณจาก fixture จริง (~11.1% และ ~3.2 วันตามลำดับ) สูงกว่าค่าเดิม → การ์ด before/after
// จะอ่านว่า "แย่ลง" ซึ่งขัด pitch — แก้ที่ baseline (สมเหตุผลกว่าการบิดข้อมูลออเดอร์เพิ่มเพื่อไล่ตัวเลข)
// ทุกคู่ใน baselineComparison() ต้องทิศทางเดียวกัน: ปัจจุบันดีกว่า baseline เสมอ
import type { MattiiBenchmark } from "./types";
import { MOCK_ORG_ID, daysAgo } from "./helpers";

export const benchmark: MattiiBenchmark = {
  id: "bmk-mattii-01",
  org_id: MOCK_ORG_ID,
  lead_time_baseline_days: 9.0,
  cf_wait_baseline_days: 5.0,
  reprint_rate_baseline: 18.0,
  late_rate_baseline: 18.0,
  orders_per_month_baseline: 95,
  reply_time_baseline_minutes: 45,
  source_note: "ประมาณการจากเจ้าของร้าน ก.ค. 2569",
  created_at: daysAgo(30),
  updated_at: daysAgo(30),
};

/** array เดียว (singleton) — เผื่อหน้าที่อยากวนลูปเหมือน entity อื่น */
export const benchmarks: MattiiBenchmark[] = [benchmark];
