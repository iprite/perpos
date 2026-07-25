-- ============================================================================
-- _bi_activate_tmc_metrics.sql — เปิดใช้งาน metric ฝั่ง TMC (draft → verified)
-- ⚠️ ชื่อไฟล์ขึ้นต้นด้วย "_" เจตนา = ไม่ใช่ migration · ห้าม apply อัตโนมัติ
--
-- ⛔ ห้ามรันก่อนครบ 4 เงื่อนไข (docs/BI_FEATURE.md §3.1 ข้อ 6):
--   1) migration `20260725120000_bi_tmc_scope_and_metrics.sql` apply แล้ว
--   2) invariant test เขียว — `apps/perpos/src/lib/bi/metrics.tmc.test.ts`
--   3) รัน `_bi_metric_check_tmc.sql` บน DB จริงแล้ว **ทุกบล็อกขึ้น OK**
--      (= เลขจาก run_bi_metric ตรงกับ computeTmcDashboard บนชุดข้อมูลเดียวกัน)
--   4) เจ้าของกิจการ TMC อ่าน definition_th ของแต่ละตัวแล้วเซ็นรับ
-- metric ที่ยัง draft = บอทตอบ "ยังไม่มีนิยามที่ยืนยันสำหรับคำถามนี้" (พฤติกรรมที่ถูกต้อง)
--
-- ⚠️ ก่อนรัน: แทน <VERIFIED_BY_PROFILE_UUID> ด้วย profiles.id ของคนที่เซ็นรับจริง
--    (หา uuid: SELECT id, email FROM profiles WHERE email = '<อีเมลผู้เซ็นรับ>';)
-- ⚠️ หลังรัน: `pnpm bi:embed` ถ้ายังไม่เคยรันหลัง seed (embedding = NULL → ไม่ถูก match)
-- ============================================================================

UPDATE public.bi_metrics
   SET status      = 'verified',
       verified_at = now(),
       verified_by = '<VERIFIED_BY_PROFILE_UUID>'::uuid
 WHERE key IN (
   -- สมุดบัญชีหลัก (เทียบ totals.finance ของ computeTmcDashboard)
   'tmc.finance_income',
   'tmc.finance_expense',
   'tmc.finance_net_profit',      -- owner-only
   -- สมุดเงินสดย่อย (เทียบ totals.petty)
   'tmc.petty_cash_expense',
   'tmc.petty_cash_top_up',
   -- การเข้าพัก (เทียบ totals.stays + กราฟรายเดือน)
   'tmc.stay_count',
   'tmc.stay_nights',
   'tmc.stay_room_revenue',
   'tmc.stay_fnb_revenue',
   'tmc.stay_adr',
   'tmc.stay_avg_nights'
 )
   AND module_scope = 'tmc'
   AND status = 'draft';

-- ---------------------------------------------------------------------------
-- ⛔ ยังเปิดไม่ได้ — ข้อมูลต้นทางว่าง (ตรวจเมื่อ 2026-07-25)
--   'tmc.stay_deposit_outstanding'
--     deposit_received/deposit_returned = non-null 0 จาก 203 แถว ⇒ ตอบได้แค่ 0 เสมอ
--     เปิดเมื่อ: เริ่มบันทึกเงินมัดจำจริง แล้วรัน `_bi_metric_check_tmc.sql` ซ้ำให้ขึ้น OK
--     (uncomment บล็อกนี้แล้วรัน)
-- UPDATE public.bi_metrics
--    SET status = 'verified', verified_at = now(), verified_by = '<VERIFIED_BY_PROFILE_UUID>'::uuid
--  WHERE key = 'tmc.stay_deposit_outstanding' AND status = 'draft';

-- ตรวจผล
SELECT key, label_th, status, verified_at
  FROM public.bi_metrics
 WHERE module_scope = 'tmc'
 ORDER BY key;

-- ---------------------------------------------------------------------------
-- ย้อนกลับ (ถ้าพบว่านิยามยังไม่นิ่ง) — ปิดกลับเป็น draft ได้ทันที
-- ---------------------------------------------------------------------------
-- UPDATE public.bi_metrics
--    SET status = 'draft', verified_at = NULL, verified_by = NULL
--  WHERE module_scope = 'tmc';
