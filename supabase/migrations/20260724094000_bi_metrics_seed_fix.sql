-- ============================================================================
-- bi — แก้ default_view/time_basis ของ metric ที่ seed ผิด (integration-reviewer)
-- ⚠️ seed ชุดเดิม (20260724091000) apply prod ไปแล้ว → ห้ามแก้ไฟล์เดิม · ไฟล์นี้ UPDATE ราย key
-- idempotent: รันซ้ำได้ (UPDATE ค่าคงที่ ไม่ทับ status/embedding/verified_*)
-- ⛔ ห้ามแตะ status — ทั้ง 29 ตัวต้องคง 'draft' รอ golden test + gate G4
--
-- ── BLOCKER-2 · "period":"snapshot" ไม่มีในสัญญา (§6.7) และไม่มีใครรองรับ ──────
-- ค่าที่ใช้ได้มีแค่ all · this_month · last_month · this_quarter · this_year · this_fiscal_year
-- engine (runner.ts): isSnapshotMetric = time_grains=[] && default_view.period='all'
--   → 'snapshot' ทำให้ตกเข้า default ของ defaultPeriodOf = ปีปฏิทินปัจจุบัน
--   → 6 metric ที่ time_basis IS NULL ได้ date_from/date_to → RPC โยน "เป็น snapshot ไม่รองรับช่วงวันที่"
--     → runner retry ตัดวันที่ แต่บรรทัดนิยามยังพิมพ์ "ช่วงเวลา: ปี 2569" ทั้งที่ SQL ไม่ได้กรองวันเลย
--     = ขัดกฎเหล็ก §3.1 ข้อ 5 (คำตอบต้องบอกช่วงเวลาที่ใช้จริง) + เสีย round-trip ทุกคำถาม
-- แก้: 'snapshot' → 'all' (6 ตัว) → isSnapshotMetric=true → ไม่ส่งวันที่ +
--      คำตอบขึ้น "ภาพ ณ ปัจจุบัน (ไม่อิงช่วงเวลา)" ตามความจริง
--
-- ── M2 · metric ที่มี time_basis จริง แต่ถูกตีเป็น snapshot ────────────────────
-- time_grains=[] + period='all' → snapshotOnly=true → runner **เพิกเฉยช่วงเวลาที่ผู้ใช้ระบุ**
--   ("ปันผลปีนี้" ได้ยอดทุกช่วงเวลา + ข้อความ "ไม่อิงช่วงเวลา")
-- metric กลุ่มนี้ template มีมิติตายตัว (ไม่มี {{dim_select}}) → **เพิ่ม time_grains ไม่ได้**
--   (RPC จะ RAISE เมื่อขอ time_grain กับ template ที่ไม่มีรูให้เสียบ — guard N3)
--   → จึงแก้ด้วย default_view.period ให้เป็นค่าอิงเวลา = 'this_year' (D2: ปีปฏิทินเป็นค่าตั้งต้น)
-- ยกเว้น capital_pool_balance = "ยอดคงเหลือสะสม" ซึ่งกรองช่วงเวลาแล้วความหมายผิด
--   (ตัดเงินลงขันปีก่อนออก) → ทำให้เป็น snapshot จริงด้วยการตั้ง time_basis = NULL
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) BLOCKER-2 — 6 metric ที่ time_basis IS NULL: period 'snapshot' → 'all'
--    (time_grains เป็น '{}' อยู่แล้ว → หลังแก้ isSnapshotMetric = true ตามที่ต้องการ)
-- ---------------------------------------------------------------------------
UPDATE public.bi_metrics
   SET default_view = jsonb_set(default_view, '{period}', '"all"'::jsonb, true),
       updated_at   = now()
 WHERE key IN (
   'gov_procure.receivable_outstanding',
   'gov_procure.receivable_overdue',
   'gov_procure.receivable_aging_buckets',
   'gov_procure.profit_pending',
   'gov_procure.commission_payable',
   'gov_procure.stuck_orders'
 )
   AND default_view->>'period' IS DISTINCT FROM 'all';

-- ---------------------------------------------------------------------------
-- 2) M2 — metric ที่มี time_basis จริง ต้องไม่เข้าเงื่อนไข snapshot
--    2a) ไปป์ไลน์ตามขั้นตอน (time_basis=start_date) — ต้องกรอง "ไตรมาสนี้/เดือนนี้" ได้
--    2b) กองทุน/นักลงทุน (time_basis=flow_date) — "ปันผลปีนี้" ต้องได้เฉพาะปีนี้
--    default = ปีปฏิทินปัจจุบัน (D2) · ผู้ใช้ระบุช่วงอื่นได้ตามปกติ
-- ---------------------------------------------------------------------------
UPDATE public.bi_metrics
   SET default_view = jsonb_set(default_view, '{period}', '"this_year"'::jsonb, true),
       updated_at   = now()
 WHERE key IN (
   'gov_procure.pipeline_by_stage_incl_vat',
   'gov_procure.pipeline_by_stage_excl_vat',
   'gov_procure.capital_contribution',
   'gov_procure.capital_allocated',
   'gov_procure.investor_dividend',
   'gov_procure.investor_repayment'
 )
   AND default_view->>'period' IS DISTINCT FROM 'this_year';

-- ---------------------------------------------------------------------------
-- 3) M2 (ยกเว้น) — ยอดกองทุนคงเหลือ = ยอดสะสม ณ ปัจจุบัน ไม่ใช่ยอดของช่วงเวลา
--    ตั้ง time_basis = NULL → เป็น snapshot จริง (period 'all' เดิมถูกต้องอยู่แล้ว)
--    หมายเหตุ: ยังกรองช่วงวันเองได้ผ่าน filter 'flow_date' (date_range) ถ้าอยากดู "การเคลื่อนไหวช่วงนี้"
-- ---------------------------------------------------------------------------
UPDATE public.bi_metrics
   SET time_basis    = NULL,
       default_view  = jsonb_set(default_view, '{period}', '"all"'::jsonb, true),
       definition_th = 'ยอดคงเหลือสะสมของกองกลาง ณ ปัจจุบัน คำนวณเป็น เงินลงขัน บวก เงินคืนเข้ากองกลาง '
                       || 'ลบ ทุนที่กระจายไปบริษัท ลบ ปันผล ลบ เงินต้นที่คืนนักลงทุน — เป็นยอดสะสมทุกช่วงเวลา '
                       || 'ไม่ได้จำกัดตามปี (ถ้าจำกัดช่วงเวลาจะตัดเงินลงขันของปีก่อนออก ทำให้ยอดผิด) · '
                       || 'ทิศทางเข้า-ออกของแต่ละชนิดรายการยังรอเจ้าของธุรกิจยืนยัน metric นี้จึงยังเป็นสถานะร่าง',
       updated_at    = now()
 WHERE key = 'gov_procure.capital_pool_balance'
   AND (time_basis IS NOT NULL OR default_view->>'period' IS DISTINCT FROM 'all');

-- ---------------------------------------------------------------------------
-- 4) ตรวจผล — คอลัมน์ is_snapshot ต้องตรงกับ "ตั้งใจ" ทุกแถว (7 ตัวเท่านั้นที่ true)
--    is_snapshot (นิยามเดียวกับ runner.ts) = time_grains = '{}' AND default_view->>'period' = 'all'
-- ---------------------------------------------------------------------------
SELECT key,
       time_basis,
       default_view->>'period'                                                    AS period,
       coalesce(array_length(time_grains,1),0)                                    AS n_grains,
       (coalesce(array_length(time_grains,1),0) = 0
        AND default_view->>'period' = 'all')                                      AS is_snapshot,
       status
FROM public.bi_metrics
ORDER BY is_snapshot DESC, key;

-- ต้องได้ 7 แถว: receivable_outstanding, receivable_overdue, receivable_aging_buckets,
--                profit_pending, commission_payable, stuck_orders, capital_pool_balance
SELECT count(*) AS snapshot_count
FROM public.bi_metrics
WHERE coalesce(array_length(time_grains,1),0) = 0 AND default_view->>'period' = 'all';

-- ห้ามเหลือ period นอกสัญญา §6.7 (ต้องได้ 0 แถว)
SELECT key, default_view->>'period' AS bad_period
FROM public.bi_metrics
WHERE default_view->>'period' IS NULL
   OR default_view->>'period' NOT IN
      ('all','this_month','last_month','this_quarter','this_year','this_fiscal_year');

-- ห้ามมี metric ที่ is_snapshot=true แต่ยังมี time_basis (= M2 ซ้ำรอย · ต้องได้ 0 แถว)
SELECT key, time_basis
FROM public.bi_metrics
WHERE time_basis IS NOT NULL
  AND coalesce(array_length(time_grains,1),0) = 0
  AND default_view->>'period' = 'all';

-- ห้ามมี metric ที่ time_basis IS NULL แต่ไม่ใช่ snapshot (= BLOCKER-2 ซ้ำรอย · ต้องได้ 0 แถว)
SELECT key, default_view->>'period' AS period
FROM public.bi_metrics
WHERE time_basis IS NULL
  AND NOT (coalesce(array_length(time_grains,1),0) = 0 AND default_view->>'period' = 'all');

-- status ต้องยังเป็น draft ทั้ง 29 (ยืนยันว่าไฟล์นี้ไม่แตะ)
SELECT status, count(*) FROM public.bi_metrics GROUP BY status ORDER BY 1;
