-- ============================================================================
-- _bi_metric_check.sql — สคริปต์ตรวจเลข BI เทียบกับนิยามกลาง (ไม่ใช่ migration)
-- ⚠️ ชื่อไฟล์ขึ้นต้นด้วย "_" เจตนา = ห้าม apply เป็น migration · ใช้รันมือหลัง B1 apply แล้ว
--
-- org เป้าหมาย: p2p-x-89 = 0386f64e-7c25-4bf6-aa4c-9565f3f9fbee
-- signature: run_bi_metric(org_id, metric_key, params, role, allow_draft)
--   ในไฟล์นี้ใช้ role='owner' + allow_draft=true เพราะเป็นการ "ตรวจเลข" ก่อนเปิดใช้งาน
--   (เส้นทางจริงของ /api/bi/ask ส่ง role ของผู้ถามจริง และ allow_draft=false เสมอ)
-- วิธีใช้: รันทีละบล็อกแล้วเทียบ "ค่าที่ได้จาก run_bi_metric" กับ "ค่าอ้างอิง (SQL ตรง)"
--   ต้องตรงกันเป๊ะทุกบล็อก · ไม่ตรง = ห้ามตั้ง status='verified'
--   ค่าอ้างอิงเขียนด้วยกฎเดียวกับ lib/gov-procure/summary.ts (computeSummary/isOverdue/computeDuration)
--
-- ค่าคาดหวังจาก snapshot ข้อมูลจริง ณ 2026-07-24 (17 ใบ, 2026-06-06 → 2026-07-21):
--   order_count = 17 · stage: quotation 13 ใบ (904,619.35) / contracted 4 ใบ (190,658.00)
--   pipeline_incl_vat รวม = 1,095,277.35 (มีราคา 13/17 ใบ) · pipeline_excl_vat มีครบ 17/17
--   ไม่มีงาน delivered/paid/closed → เงินค้างรับ/เงินรับจริง/aging/duration = 0 แถว
--   capital_flows = 4 แถว
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) ตรวจข้อเท็จจริงของข้อมูลก่อน (ใช้ตัดสินว่า metric ไหนพร้อมเป็น verified)
--    ⚠️ สำคัญ: ทุก metric ของงานจัดซื้อยึด time_basis = start_date
--       ถ้า start_date กรอกไม่ครบ ให้พิจารณาสลับเป็น created_at ด้วย
--       UPDATE bi_metrics SET time_basis='created_at' WHERE key IN (...);
-- ---------------------------------------------------------------------------
SELECT count(*)                        AS orders_total,
       count(start_date)               AS has_start_date,
       count(price_incl_vat)           AS has_price_incl,
       count(price_excl_vat)           AS has_price_excl,
       count(cost_price)               AS has_cost_price,
       count(total_cost_89)            AS has_total_cost_89,
       count(contract_date)            AS has_contract_date,
       count(delivery_date)            AS has_delivery_date,
       count(receipt_date)             AS has_receipt_date,
       count(DISTINCT customer_name)   AS distinct_customers,
       count(DISTINCT department)      AS distinct_departments,
       count(DISTINCT company)         AS distinct_companies
FROM gov_procure_orders
WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee';

-- เดือนที่มีข้อมูล (เทียบ start_date กับ created_at — เลือก time_basis ให้ตรงความจริง)
SELECT to_char(date_trunc('month', start_date), 'YYYY-MM') AS by_start_date, count(*)
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee'
GROUP BY 1 ORDER BY 1;
SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS by_created_at, count(*)
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee'
GROUP BY 1 ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 1) gov_procure.order_count  (คาดหวัง value = 17)
-- ---------------------------------------------------------------------------
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.order_count','{}', 'owner', true) AS bi;
-- อ้างอิง (computeSummary().order_count = orders.length)
SELECT count(*) AS ref_order_count
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee';

-- ---------------------------------------------------------------------------
-- 2) gov_procure.pipeline_value_incl_vat  (คาดหวัง value = 1,095,277.35 · priced_count = 13)
-- ---------------------------------------------------------------------------
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.pipeline_value_incl_vat','{}', 'owner', true) AS bi;
-- อ้างอิง (pipelineValue() = Σ price_incl_vat โดย null = 0)
SELECT sum(coalesce(price_incl_vat,0)) AS ref_pipeline_incl_vat, count(price_incl_vat) AS ref_priced_count
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee';

-- 2b) gov_procure.pipeline_value_excl_vat (priced_count ควร = 17)
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.pipeline_value_excl_vat','{}', 'owner', true) AS bi;
SELECT sum(coalesce(price_excl_vat,0)) AS ref_pipeline_excl_vat, count(price_excl_vat) AS ref_priced_count
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee';

-- ---------------------------------------------------------------------------
-- 3) gov_procure.pipeline_by_stage_incl_vat  (คาดหวัง 6 แถวเสมอ · quotation 13/904,619.35 · contracted 4/190,658.00 · ที่เหลือ 0)
-- ---------------------------------------------------------------------------
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.pipeline_by_stage_incl_vat','{}', 'owner', true) AS bi;
-- อ้างอิง (pipelineByStage() — คืนครบ 6 stage เสมอ)
SELECT s.stage, coalesce(t.cnt,0) AS ref_count, coalesce(t.val,0) AS ref_value
FROM (VALUES ('quotation'),('contracted'),('procuring'),('delivered'),('paid'),('closed')) s(stage)
LEFT JOIN (
  SELECT stage, count(*) cnt, sum(coalesce(price_incl_vat,0)) val
  FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee' GROUP BY stage
) t ON t.stage = s.stage
ORDER BY array_position(ARRAY['quotation','contracted','procuring','delivered','paid','closed']::text[], s.stage);

-- 3b) ก่อน VAT
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.pipeline_by_stage_excl_vat','{}', 'owner', true) AS bi;

-- ---------------------------------------------------------------------------
-- 4) gov_procure.by_company_incl_vat / _excl_vat  (คาดหวัง 4 บริษัท: 89 Global Work 6 · P2P Supply 7 · ALPHA ENGINEERING 3 · MAGISTATS TRADING 1)
-- ---------------------------------------------------------------------------
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.by_company_incl_vat','{}', 'owner', true) AS bi;
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.by_company_excl_vat','{}', 'owner', true) AS bi;
-- อ้างอิง (by_company ใน computeSummary — แต่ดึงรายชื่อจากข้อมูลจริง ไม่ hardcode)
SELECT coalesce(company,'(ไม่ระบุ)') AS company, count(*) AS ref_count,
       sum(coalesce(price_incl_vat,0)) AS ref_value_incl, sum(coalesce(price_excl_vat,0)) AS ref_value_excl
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee'
GROUP BY 1 ORDER BY 3 DESC;

-- ---------------------------------------------------------------------------
-- 5) มิติ + ช่วงเวลา (ตรวจว่า allowlist/binder ทำงาน)
--    5a group by หน่วยงาน (department distinct = 7)
-- ---------------------------------------------------------------------------
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.pipeline_value_excl_vat','{"dimension":"department"}', 'owner', true) AS bi;
SELECT coalesce(department,'(ไม่ระบุ)') AS department, sum(coalesce(price_excl_vat,0)) AS ref_value, count(*) AS ref_count
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee'
GROUP BY 1 ORDER BY 2 DESC;

-- 5b รายเดือน (คาดหวัง 2 แถว: 2026-06 = 8 ใบ · 2026-07 = 9 ใบ)
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.order_count','{"time_grain":"month"}', 'owner', true) AS bi;
SELECT to_char(date_trunc('month', start_date),'YYYY-MM-DD') AS ref_month, count(*) AS ref_count
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee'
GROUP BY 1 ORDER BY 1;

-- 5c filter ตามขั้นตอน (คาดหวัง 13 ใบ)
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.order_count','{"filters":{"stage":["quotation"]}}', 'owner', true) AS bi;
SELECT count(*) AS ref_quotation FROM gov_procure_orders
WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee' AND stage = 'quotation';

-- ---------------------------------------------------------------------------
-- 6) ต้นทุน (owner-only) — purchase_cost_total = Σ cost_price (คาดหวัง costed_count ≈ 12)
-- ---------------------------------------------------------------------------
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.purchase_cost_total','{}', 'owner', true) AS bi;
SELECT sum(coalesce(cost_price,0)) AS ref_cost, count(cost_price) AS ref_costed_count
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee';

-- ---------------------------------------------------------------------------
-- 7) รายการงาน (drill-down) — จำนวนแถวต้อง = 17
-- ---------------------------------------------------------------------------
SELECT jsonb_array_length(
  public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.orders_detail','{}', 'owner', true)->'rows'
) AS bi_detail_rows;

-- ---------------------------------------------------------------------------
-- 8) กองทุน / นักลงทุน (owner-only · capital_flows = 4 แถว)
-- ---------------------------------------------------------------------------
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.capital_flow_by_type','{}', 'owner', true) AS bi;
SELECT flow_type, sum(amount) AS ref_amount, count(*) AS ref_count
FROM gov_procure_capital_flows WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee'
GROUP BY 1 ORDER BY 2 DESC;

SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.capital_contribution','{}', 'owner', true) AS bi;
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.capital_allocated','{}', 'owner', true)   AS bi;
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.investor_dividend','{}', 'owner', true)   AS bi;
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.investor_repayment','{}', 'owner', true)  AS bi;
-- อ้างอิงต่อชนิด × นักลงทุน
SELECT f.flow_type, coalesce(i.name,'(ไม่ระบุ)') AS investor, sum(f.amount) AS ref_amount, count(*) AS ref_count
FROM gov_procure_capital_flows f
LEFT JOIN gov_procure_investors i ON i.id = f.investor_id
WHERE f.org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee'
GROUP BY 1,2 ORDER BY 1,3 DESC;

-- ---------------------------------------------------------------------------
-- 9) metric ที่ยัง draft — รันดูได้ว่า "0 แถว/0 บาท" จริงตามข้อมูลปัจจุบัน
--    (ยืนยันเหตุผลที่ยังไม่ตั้ง verified · เมื่อข้อมูล milestone/กำไรเข้าครบค่อยเปิด)
-- ---------------------------------------------------------------------------
SELECT k AS draft_metric,
       public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee', k, '{}', 'owner', true) AS bi
FROM unnest(ARRAY[
  'gov_procure.receivable_outstanding','gov_procure.receivable_overdue','gov_procure.receivable_aging_buckets',
  'gov_procure.revenue_collected','gov_procure.cycle_time_avg','gov_procure.profit_realized',
  'gov_procure.profit_pending','gov_procure.profit_margin_pct_incl_vat','gov_procure.profit_margin_pct_excl_vat',
  'gov_procure.commission_payable','gov_procure.stuck_orders','gov_procure.cost_total',
  'gov_procure.top_customers_incl_vat','gov_procure.top_customers_excl_vat','gov_procure.capital_pool_balance'
]) AS k;
-- อ้างอิง computeSummary ฝั่งเงินค้างรับ/กำไร (ควรได้ 0 ทั้งหมดตอนนี้)
SELECT count(*) FILTER (WHERE stage='delivered')                       AS ref_receivable_count,
       sum(coalesce(net_receivable,0)) FILTER (WHERE stage='delivered') AS ref_receivable_total,
       sum(coalesce(net_profit_89,0)) FILTER (WHERE stage IN ('paid','closed')) AS ref_profit_realized,
       sum(coalesce(net_profit_89,0)) FILTER (WHERE stage NOT IN ('paid','closed')) AS ref_profit_pending,
       count(*) FILTER (WHERE commission_payment_date IS NULL AND coalesce(commission_net_payable,0) <> 0) AS ref_commission_pending
FROM gov_procure_orders WHERE org_id = '0386f64e-7c25-4bf6-aa4c-9565f3f9fbee';

-- ---------------------------------------------------------------------------
-- 10) ด่านความปลอดภัย — ทุกข้อต้อง "ERROR" (ถ้าไม่ error = ช่องโหว่ ห้าม go-live)
-- ---------------------------------------------------------------------------
-- 10a คอลัมน์นอก allowlist
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.order_count','{"dimension":"notes"}', 'owner', true);
-- 10b filter นอก allowlist
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.order_count','{"filters":{"notes":"x"}}', 'owner', true);
-- 10c metric ไม่รู้จัก
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','nope.x','{}', 'owner', true);
-- 10d ไม่ส่ง org
SELECT public.run_bi_metric(NULL,'gov_procure.order_count','{}', 'owner', true);
-- 10e ค่า injection ต้องถูกมองเป็น "ค่า" ไม่ใช่ SQL (ไม่ error แต่ต้องได้ 0 บาท/0 แถว ไม่ใช่ทั้งพอร์ต)
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.order_count',
       '{"filters":{"department":"x'' OR 1=1 --"}}', 'owner', true);
-- 10f [S2] viewer เรียก metric owner-only ต้อง ERROR (RBAC ระดับ metric ที่ตัว runner)
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.investor_dividend','{}', 'viewer', true);
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.purchase_cost_total','{}', 'analyst', true);
-- 10g [S2] metric ที่ยัง draft ต้อง ERROR เมื่อไม่ได้ตั้ง allow_draft (เส้นทางจริงของ /api/bi/ask)
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.profit_realized','{}', 'owner', false);
-- 10h [N3] ขอจัดกลุ่มกับ metric ที่มิติตายตัว ต้อง ERROR (ห้ามรับแล้วเงียบหาย)
SELECT public.run_bi_metric('0386f64e-7c25-4bf6-aa4c-9565f3f9fbee','gov_procure.investor_dividend',
       '{"time_grain":"month"}', 'owner', true);
-- 10i [S1] ตัด PostgREST ตรง: ต้องได้ 0 สิทธิ์ให้ anon/authenticated ทุกตาราง
SELECT table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name LIKE 'bi\_%' AND grantee IN ('anon','authenticated');
-- 10j [S3] bi_query_log ต้องมีเฉพาะ policy SELECT (ไม่มี policy เขียน = deny-all)
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.bi_query_log'::regclass;

-- ---------------------------------------------------------------------------
-- 11) การเปิดใช้งาน metric (draft → verified)
--     ⚠️ ห้ามรัน UPDATE เอง — ใช้ `_bi_activate_metrics.sql` เท่านั้น
--     (มีเงื่อนไข golden test + gate G4 + verified_by กำกับไว้ครบ)
-- ---------------------------------------------------------------------------
