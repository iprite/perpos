-- ============================================================================
-- _bi_metric_check_tmc.sql — ตรวจเลข metric ฝั่ง TMC เทียบกับนิยามกลาง (ไม่ใช่ migration)
-- ⚠️ ชื่อไฟล์ขึ้นต้นด้วย "_" เจตนา = ห้าม apply เป็น migration · รันมือหลัง seed apply แล้ว
--
-- org เป้าหมาย: tmc = 1f52618c-09c4-49c5-a929-ea5060f26e7d
-- signature: run_bi_metric(org_id, metric_key, params, role, allow_draft)
--   ใช้ role='owner' + allow_draft=true เพราะเป็นการ "ตรวจเลข" ก่อนเปิดใช้งาน
--   (เส้นทางจริงของ /api/bi/ask ส่ง role ผู้ถามจริง + allow_draft=false เสมอ)
--
-- ค่าอ้างอิงเขียนด้วยกฎเดียวกับ apps/perpos/src/lib/tmc/dashboard.ts (computeTmcDashboard)
--   ทุกบล็อกต้องขึ้น status = 'OK' · มี MISMATCH แม้บล็อกเดียว = ห้ามตั้ง status='verified'
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) ข้อเท็จจริงของข้อมูลก่อน (ใช้ตัดสินว่า metric ไหนพร้อมเป็น verified)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM tmc_finance_entries WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d')  AS finance_rows,
  (SELECT count(*) FROM tmc_finance_entries WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d'
     AND account_id = '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7')                                       AS finance_petty_rows,
  (SELECT count(*) FROM tmc_petty_cash_txns WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d')  AS petty_rows,
  (SELECT count(*) FROM tmc_stays WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d')            AS stay_rows,
  (SELECT count(*) FROM tmc_stays WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d'
     AND check_out IS NULL)                                                                          AS stay_no_checkout,
  (SELECT min(check_in)::text || ' → ' || max(check_in)::text FROM tmc_stays
     WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d')                                          AS stay_range;

-- ---------------------------------------------------------------------------
-- 1–12) เทียบค่าจาก run_bi_metric กับค่าอ้างอิง (ทั้งช่วงข้อมูล = ไม่ส่ง date_from/date_to)
--       แต่ละแถว: metric / ค่าจาก BI / ค่าอ้างอิง / status
-- ---------------------------------------------------------------------------
WITH org AS (SELECT '1f52618c-09c4-49c5-a929-ea5060f26e7d'::uuid AS id),
bi AS (
  SELECT k, (public.run_bi_metric((SELECT id FROM org), k, '{}'::jsonb, 'owner', true)
             -> 'rows' -> 0 ->> 'value')::numeric AS v
  FROM unnest(ARRAY[
    'tmc.finance_income','tmc.finance_expense','tmc.finance_net_profit',
    'tmc.petty_cash_expense','tmc.petty_cash_top_up',
    'tmc.stay_count','tmc.stay_nights','tmc.stay_room_revenue','tmc.stay_fnb_revenue',
    'tmc.stay_adr','tmc.stay_avg_nights','tmc.stay_deposit_outstanding'
  ]) AS k
),
fin AS (   -- สมุดบัญชีหลัก: ตัดบัญชีเงินสดย่อยออก (PETTY_CASH_ACCOUNT ใน dashboard.ts)
  SELECT sum(coalesce(income,0)) AS income, sum(coalesce(expense,0)) AS expense
  FROM tmc_finance_entries
  WHERE org_id = (SELECT id FROM org)
    AND account_id IS DISTINCT FROM '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7'::uuid
),
petty AS (
  SELECT sum(amount) FILTER (WHERE txn_type = 'expense') AS expense,
         sum(amount) FILTER (WHERE txn_type = 'top_up')  AS top_up
  FROM tmc_petty_cash_txns WHERE org_id = (SELECT id FROM org)
),
stay AS (  -- จำนวนคืน = check_out − check_in · ไม่มี check_out = 1 คืน (ตรง dashboard.ts)
  SELECT count(*)                                        AS cnt,
         sum(CASE WHEN check_out IS NULL THEN 1 ELSE GREATEST(check_out - check_in, 0) END) AS nights,
         sum(coalesce(room_rate,0))                      AS room_revenue,
         sum(coalesce(food_amount,0) + coalesce(drink_amount,0)
             + coalesce(mookata_amount,0) + coalesce(bbq_amount,0)) AS fnb,
         sum(coalesce(deposit_received,0)) - sum(coalesce(deposit_returned,0)) AS deposit_out
  FROM tmc_stays WHERE org_id = (SELECT id FROM org)
),
ref AS (
  SELECT 'tmc.finance_income'::text k, (SELECT income FROM fin) v UNION ALL
  SELECT 'tmc.finance_expense',        (SELECT expense FROM fin) UNION ALL
  SELECT 'tmc.finance_net_profit',     (SELECT income - expense FROM fin) UNION ALL
  SELECT 'tmc.petty_cash_expense',     (SELECT expense FROM petty) UNION ALL
  SELECT 'tmc.petty_cash_top_up',      (SELECT top_up FROM petty) UNION ALL
  SELECT 'tmc.stay_count',             (SELECT cnt FROM stay) UNION ALL
  SELECT 'tmc.stay_nights',            (SELECT nights FROM stay) UNION ALL
  SELECT 'tmc.stay_room_revenue',      (SELECT room_revenue FROM stay) UNION ALL
  SELECT 'tmc.stay_fnb_revenue',       (SELECT fnb FROM stay) UNION ALL
  SELECT 'tmc.stay_adr',               (SELECT room_revenue / NULLIF(nights,0) FROM stay) UNION ALL
  SELECT 'tmc.stay_avg_nights',        (SELECT nights::numeric / NULLIF(cnt,0) FROM stay) UNION ALL
  SELECT 'tmc.stay_deposit_outstanding', (SELECT deposit_out FROM stay)
)
SELECT ref.k                                  AS metric,
       bi.v                                   AS bi_value,
       ref.v                                  AS ref_value,
       CASE WHEN round(coalesce(bi.v,0), 4) = round(coalesce(ref.v,0), 4)
            THEN 'OK' ELSE 'MISMATCH' END     AS status
FROM ref JOIN bi USING (k)
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 13) แยกตามแปลง — ผลรวมของทุกแปลงต้องเท่ากับยอดรวมก้อนเดียว (กันมิติทำเลขหาย)
-- ---------------------------------------------------------------------------
SELECT 'stay_room_revenue by property' AS check_name,
       (SELECT sum((r ->> 'value')::numeric)
          FROM jsonb_array_elements(
            public.run_bi_metric('1f52618c-09c4-49c5-a929-ea5060f26e7d','tmc.stay_room_revenue',
              '{"dimension":"property_code"}'::jsonb,'owner',true) -> 'rows') r) AS sum_by_dimension,
       (SELECT sum(coalesce(room_rate,0)) FROM tmc_stays
         WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d')                  AS ref_total;

-- ---------------------------------------------------------------------------
-- 14) แยกรายเดือน — ผลรวมทุกเดือนต้องเท่ากับจำนวนการเข้าพักทั้งหมด
-- ---------------------------------------------------------------------------
SELECT 'stay_count by month' AS check_name,
       (SELECT sum((r ->> 'value')::numeric)
          FROM jsonb_array_elements(
            public.run_bi_metric('1f52618c-09c4-49c5-a929-ea5060f26e7d','tmc.stay_count',
              '{"time_grain":"month"}'::jsonb,'owner',true) -> 'rows') r)        AS sum_by_month,
       (SELECT count(*) FROM tmc_stays
         WHERE org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d')                  AS ref_total;

-- ---------------------------------------------------------------------------
-- 15) tenant isolation — ยิง org อื่นด้วย metric เดียวกันต้องไม่เห็นข้อมูล TMC
--     (แทน <OTHER_ORG_UUID> ด้วย org ใดก็ได้ที่ไม่ใช่ tmc · คาดหวัง value = NULL/0)
-- ---------------------------------------------------------------------------
-- SELECT public.run_bi_metric('<OTHER_ORG_UUID>','tmc.stay_count','{}'::jsonb,'owner',true);
