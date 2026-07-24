-- ============================================================================
-- _bi_activate_metrics.sql — เปิดใช้งาน metric (draft → verified) หลังผ่านด่านครบ
-- ⚠️ ชื่อไฟล์ขึ้นต้นด้วย "_" เจตนา = ไม่ใช่ migration · ห้าม apply อัตโนมัติ
--
-- ⛔ ห้ามรันไฟล์นี้ก่อนครบ 3 เงื่อนไข (contract §3.1 ข้อ 6 · §8.2):
--   1) migration `20260724090000_bi_schema.sql` + `20260724091000_bi_metrics_seed.sql` apply แล้ว
--   2) **golden test เขียว** — `apps/perpos/src/lib/bi/metrics.golden.test.ts` (B6a) ผ่าน
--      = ยิง run_bi_metric แล้วเลขตรงกับ lib/gov-procure/summary.ts (computeSummary/isOverdue/
--      computeDuration) บนชุดข้อมูลเดียวกัน · และรัน `_bi_metric_check.sql` แล้วทุกบล็อกตรง
--   3) **gate G4** — เจ้าของธุรกิจ p2p-x-89 เซ็นรับ definition_th ของ metric ที่จะเปิด ทีละตัว
-- metric ที่ยัง draft = บอทตอบ "ยังไม่มีนิยามที่ยืนยันสำหรับคำถามนี้" (พฤติกรรมที่ถูกต้อง)
--
-- ⚠️ ก่อนรัน: แทน <VERIFIED_BY_PROFILE_UUID> ด้วย profiles.id ของคนที่เซ็นรับจริง
--    (หา uuid: SELECT id, email FROM profiles WHERE email = '<อีเมลผู้เซ็นรับ>';)
-- ⚠️ ตรวจก่อนว่าบล็อก 0 ของ `_bi_metric_check.sql` ยืนยัน time_basis แล้ว
--    (ถ้า start_date กรอกไม่ครบ ต้อง UPDATE time_basis='created_at' ก่อนเปิดใช้)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ชุดที่ 1 — 14 metric ที่ "ข้อมูลจริงรองรับแล้ว" (เปิดได้เมื่อครบเงื่อนไข 1–3)
-- ---------------------------------------------------------------------------
UPDATE public.bi_metrics
   SET status      = 'verified',
       verified_at = now(),
       verified_by = '<VERIFIED_BY_PROFILE_UUID>'::uuid
 WHERE key IN (
   -- ปริมาณ/มูลค่าพอร์ต (เทียบ computeSummary().order_count / pipelineValue())
   'gov_procure.order_count',
   'gov_procure.pipeline_value_incl_vat',
   'gov_procure.pipeline_value_excl_vat',
   -- ไปป์ไลน์ต่อขั้นตอน (เทียบ pipelineByStage() — ต้องคืนครบ 6 stage)
   'gov_procure.pipeline_by_stage_incl_vat',
   'gov_procure.pipeline_by_stage_excl_vat',
   -- แยกตามบริษัทรับงาน (เทียบ by_company)
   'gov_procure.by_company_incl_vat',
   'gov_procure.by_company_excl_vat',
   -- ต้นทุนซื้อของ (owner-only)
   'gov_procure.purchase_cost_total',
   -- รายการงานรายตัว (no_summarize)
   'gov_procure.orders_detail',
   -- กองทุน/นักลงทุน (owner-only · 3 ตัวหลัง no_summarize เพราะมิติเป็นบุคคล)
   'gov_procure.capital_flow_by_type',
   'gov_procure.capital_allocated',
   'gov_procure.capital_contribution',
   'gov_procure.investor_dividend',
   'gov_procure.investor_repayment'
 )
   AND status = 'draft';

-- ยืนยันผล (ควรได้ 14 แถว verified + 15 แถว draft)
SELECT status, count(*) FROM public.bi_metrics GROUP BY 1 ORDER BY 1;
SELECT key, label_th, status, verified_at FROM public.bi_metrics ORDER BY status, key;

-- ---------------------------------------------------------------------------
-- ชุดที่ 2 — 15 metric ที่ยัง "เปิดไม่ได้" แม้ผ่าน G4 เพราะข้อมูลจริงยังไม่มี
--   (ตอบ 0 ทุกคำถาม = ทำลายความเชื่อถือมากกว่าไม่ตอบ — §3.1 ข้อ 4)
--   เปิดทีละตัวเมื่อ "เงื่อนไขข้อมูล" ในตารางเป็นจริง + golden test ของตัวนั้นเขียว
--
--   key                                    | รออะไร
--   ---------------------------------------+--------------------------------------------------
--   gov_procure.receivable_outstanding     | มีงาน stage='delivered' และกรอก net_receivable
--   gov_procure.receivable_overdue         | ข้างต้น + กรอก delivery_date (ใช้คำนวณ aging)
--   gov_procure.receivable_aging_buckets   | ข้างต้น + กรอก delivery_date
--   gov_procure.revenue_collected          | มีงาน stage paid/closed + กรอก receipt_date
--   gov_procure.cycle_time_avg             | กรอกครบทั้ง contract_date และ receipt_date
--   gov_procure.profit_realized            | มีงาน paid/closed + กรอก net_profit_89 (ตอนนี้ = 0)
--   gov_procure.profit_pending             | กรอก net_profit_89 (ตอนนี้ = 0)
--   gov_procure.profit_margin_pct_incl_vat | กรอก net_profit_89 (ไม่งั้นได้ 0% ทุกกลุ่ม)
--   gov_procure.profit_margin_pct_excl_vat | เช่นเดียวกัน
--   gov_procure.commission_payable         | กรอก commission_net_payable (ตอนนี้ = 0)
--   gov_procure.stuck_orders               | กรอกวันที่หมุด (ตอนนี้เหลือ fallback start_date อย่างเดียว)
--   gov_procure.cost_total                 | กรอก total_cost_89 (ตอนนี้ว่าง — ใช้ purchase_cost_total แทน)
--   gov_procure.top_customers_incl_vat     | มีหน่วยงานผู้ซื้อมากกว่า 1 ราย (ตอนนี้ distinct = 1)
--   gov_procure.top_customers_excl_vat     | เช่นเดียวกัน
--   gov_procure.capital_pool_balance       | เจ้าของยืนยัน "ทิศทางเข้า-ออก" ของ flow_type ทั้ง 5 ชนิด
--
--   ตัวอย่างคำสั่งเปิดทีละตัว (แก้ key + ใส่ uuid ผู้เซ็นรับ):
--   UPDATE public.bi_metrics
--      SET status='verified', verified_at=now(), verified_by='<VERIFIED_BY_PROFILE_UUID>'::uuid
--    WHERE key = 'gov_procure.receivable_outstanding' AND status='draft';
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROLLBACK (ปิดการตอบทั้งหมดทันทีโดยไม่ลบข้อมูล — rollback plan ข้อ ② ใน §9)
--   UPDATE public.bi_metrics SET status='draft', verified_at=NULL, verified_by=NULL;
-- ---------------------------------------------------------------------------
