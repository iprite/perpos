-- ============================================================================
-- bi — เปิด scope `tmc` + seed semantic layer ชุดแรกของ TMC (12 metric)
--
-- ที่มา: docs/BI_FEATURE.md §3 (semantic layer) · §9.4 (เงื่อนไขปลุกกลับ)
--   §9.4 พักการพัฒนา BI ไว้เพราะ **ข้อมูลต้นทางของ gov_procure ว่าง** ไม่ใช่เพราะโค้ด
--   ฝั่ง TMC ตรงกันข้าม — ข้อมูลจริง ณ 2026-07-25 ของ org `tmc`:
--     tmc_stays 203 แถว (check_in 2026-02-18 → 2027-04-19) · tmc_finance_entries 701 ·
--     tmc_petty_cash_txns 560 · tmc_properties 7 · สมาชิกโมดูล tmc 6 คน
--   ⇒ metric ชุดนี้มีข้อมูลให้คำนวณจริงตั้งแต่วันแรก
--
-- ⚠️ ห้าม BI คิดกฎโดเมนเอง (§3.1 ข้อ 2) — ทุก metric ในไฟล์นี้ยึดสูตรเดียวกับ
--    `apps/perpos/src/lib/tmc/dashboard.ts` (computeTmcDashboard) ซึ่งเป็นตัวเลขที่
--    ผู้ใช้เห็นบนหน้า /[orgSlug]/tmc อยู่แล้ว:
--      · รายรับ/รายจ่าย = tmc_finance_entries โดย **ตัดบัญชีเงินสดย่อยออก**
--        (account_id <> '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7' = PETTY_CASH_ACCOUNT
--         ใน dashboard.ts — กันนับซ้ำกับสมุดเงินสดย่อย) ยึดวันที่รายการ entry_date
--      · เงินสดย่อย = tmc_petty_cash_txns แยก txn_type top_up / expense ยึด txn_date
--      · เข้าพัก = tmc_stays ยึด check_in · **จำนวนคืน/ADR = รายคืนตามวันที่พักจริง**
--        (แตก stay เป็นรายคืนด้วย generate_series · time_basis = night_date — คืนคร่อมเดือน
--         แยกเข้าเดือนที่พักจริง ตรงกับ nightsPerMonth ใน dashboard.ts · ไม่มี check_out = 1 คืน)
--        · คืนเฉลี่ยต่อการเข้าพัก (stay_avg_nights) ยังยึด check_in เพราะเป็น metric ราย stay
--        · รายได้ค่าห้อง = room_rate
--        · อาหาร/เครื่องดื่ม = food + drink + mookata + bbq
--   ถ้าแก้สูตรใน dashboard.ts ต้องแก้ที่นี่ด้วย มิฉะนั้นตัวเลขบนแชทกับบนหน้าจอจะขัดกัน
--
-- ⚠️ ทุก metric seed เป็น status='draft' (§3.1 ข้อ 6) — ไม่มีข้อยกเว้น
--    เปิดใช้งานผ่าน `supabase/migrations/_bi_activate_tmc_metrics.sql` หลังจาก
--    (1) invariant test เขียว (lib/bi/metrics.tmc.test.ts)
--    (2) รัน `_bi_metric_check_tmc.sql` แล้วเลขตรงกับ computeTmcDashboard ทุกบล็อก
--    (3) เจ้าของธุรกิจเซ็นรับ definition_th
--
-- ⚠️ หลัง apply ต้องรัน `pnpm bi:embed` — metric ที่ embedding = NULL จะไม่ถูก match เลย
--
-- idempotent: ALTER CONSTRAINT ทำใหม่ได้ · seed = INSERT ... ON CONFLICT (key) DO UPDATE
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) ขยาย allowlist ของ module_scope ให้รับ 'tmc'
--    (ฝั่งแอปต้องแก้คู่กัน: MODULE_SCOPES ใน lib/bi/types.ts + resolveOrgScopes ใน lib/bi/resolver.ts)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bi_metrics DROP CONSTRAINT IF EXISTS bi_metrics_module_scope_chk;
ALTER TABLE public.bi_metrics ADD CONSTRAINT bi_metrics_module_scope_chk
  CHECK (module_scope IN ('gov_procure','accounting','tmc','core'));

-- ---------------------------------------------------------------------------
-- 2) helper ชั่วคราว (drop ท้ายไฟล์) — ลายเซ็นเดียวกับไฟล์ seed ของ gov_procure
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bi_seed_metric(
  p_key               text,
  p_label_th          text,
  p_definition_th     text,
  p_grain             text,
  p_unit              text,
  p_sql_template      text,
  p_module_scope      text,
  p_allowed_roles     text[],
  p_status            text,
  p_chart_hint        text    DEFAULT NULL,
  p_time_basis        text    DEFAULT NULL,
  p_unit_decimals     int     DEFAULT 2,
  p_includes          text[]  DEFAULT '{}',
  p_excludes          text[]  DEFAULT '{}',
  p_synonyms          text[]  DEFAULT '{}',
  p_param_schema      jsonb   DEFAULT '{}'::jsonb,
  p_dimensions        jsonb   DEFAULT '[]'::jsonb,
  p_time_grains       text[]  DEFAULT '{}',
  p_comparisons       text[]  DEFAULT ARRAY['none','prev_period']::text[],
  p_filters           jsonb   DEFAULT '[]'::jsonb,
  p_default_view      jsonb   DEFAULT '{}'::jsonb,
  p_owner_label       text    DEFAULT 'เจ้าของกิจการ TMC',
  p_no_summarize      boolean DEFAULT false,
  p_max_period_months int     DEFAULT 36
)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.bi_metrics (
    key, label_th, definition_th, includes, excludes, grain, time_basis, unit, unit_decimals,
    synonyms, sql_template, param_schema, dimensions, time_grains, comparisons, filters,
    default_view, chart_hint, module_scope, allowed_roles, owner_label, status,
    no_summarize, max_period_months
  ) VALUES (
    p_key, p_label_th, p_definition_th, p_includes, p_excludes, p_grain, p_time_basis, p_unit,
    p_unit_decimals, p_synonyms, p_sql_template, p_param_schema, p_dimensions, p_time_grains,
    p_comparisons, p_filters, p_default_view, p_chart_hint, p_module_scope, p_allowed_roles,
    p_owner_label, p_status, p_no_summarize, p_max_period_months
  )
  ON CONFLICT (key) DO UPDATE SET
    label_th          = EXCLUDED.label_th,
    definition_th     = EXCLUDED.definition_th,
    includes          = EXCLUDED.includes,
    excludes          = EXCLUDED.excludes,
    grain             = EXCLUDED.grain,
    time_basis        = EXCLUDED.time_basis,
    unit              = EXCLUDED.unit,
    unit_decimals     = EXCLUDED.unit_decimals,
    synonyms          = EXCLUDED.synonyms,
    sql_template      = EXCLUDED.sql_template,
    param_schema      = EXCLUDED.param_schema,
    dimensions        = EXCLUDED.dimensions,
    time_grains       = EXCLUDED.time_grains,
    comparisons       = EXCLUDED.comparisons,
    filters           = EXCLUDED.filters,
    default_view      = EXCLUDED.default_view,
    chart_hint        = EXCLUDED.chart_hint,
    module_scope      = EXCLUDED.module_scope,
    allowed_roles     = EXCLUDED.allowed_roles,
    owner_label       = EXCLUDED.owner_label,
    status            = EXCLUDED.status,
    no_summarize      = EXCLUDED.no_summarize,
    max_period_months = EXCLUDED.max_period_months,
    updated_at        = now();
$$;

-- ===========================================================================
-- A. สมุดบัญชีหลัก (tmc_finance_entries) — ตัดบัญชีเงินสดย่อยออกทุกตัว
-- ===========================================================================

-- #1 รายรับรวม
SELECT public._bi_seed_metric(
  p_key           => 'tmc.finance_income',
  p_label_th      => 'รายรับรวม (สมุดบัญชีหลัก)',
  p_definition_th => 'ผลรวมช่องรายรับ (income) ของรายการในสมุดบัญชีหลัก tmc_finance_entries ตามช่วงเวลาที่เลือก ยึดวันที่รายการ (entry_date) — ตัดรายการของบัญชีเงินสดย่อยออกเพื่อไม่ให้นับซ้ำกับสมุดเงินสดย่อย ตรงกับ totals.finance.income บนหน้าภาพรวม TMC · ยอดนี้เป็นยอดที่บันทึกจริงในสมุด ไม่มีการแยกภาษีมูลค่าเพิ่ม',
  p_grain         => 'entry',
  p_unit          => 'thb',
  p_time_basis    => 'entry_date',
  p_includes      => ARRAY['ทุกรายการที่มีช่องรายรับในสมุดบัญชีหลัก','ทุกแปลง/ทุกหมวด เว้นแต่ระบุตัวกรอง'],
  p_excludes      => ARRAY['รายการของบัญชีเงินสดย่อย (นับที่ metric เงินสดย่อยแทน)','เงินเติมกองเงินสดย่อย','เงินมัดจำที่ยังไม่ตัดเป็นรายได้'],
  p_synonyms      => ARRAY['รายรับ','รายได้','เงินเข้า','ยอดรับ','รายรับรวม','income'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.income,0))::numeric AS value,
       count(*)::bigint                   AS entry_count
FROM tmc_finance_entries o, __p
WHERE o.org_id = __p.org_id
  AND o.account_id IS DISTINCT FROM '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7'::uuid
  {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","category"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"category","label_th":"หมวด","column":"category"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"category","label_th":"หมวด","column":"category","type":"text_list"},{"key":"entry_date","label_th":"ช่วงวันที่รายการ","column":"entry_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #2 รายจ่ายรวม
SELECT public._bi_seed_metric(
  p_key           => 'tmc.finance_expense',
  p_label_th      => 'รายจ่ายรวม (สมุดบัญชีหลัก)',
  p_definition_th => 'ผลรวมช่องรายจ่าย (expense) ของรายการในสมุดบัญชีหลัก tmc_finance_entries ตามช่วงเวลาที่เลือก ยึดวันที่รายการ (entry_date) — ตัดรายการของบัญชีเงินสดย่อยออกเพื่อไม่ให้นับซ้ำกับสมุดเงินสดย่อย ตรงกับ totals.finance.expense บนหน้าภาพรวม TMC',
  p_grain         => 'entry',
  p_unit          => 'thb',
  p_time_basis    => 'entry_date',
  p_includes      => ARRAY['ทุกรายการที่มีช่องรายจ่ายในสมุดบัญชีหลัก'],
  p_excludes      => ARRAY['รายจ่ายจากกองเงินสดย่อย (ดู metric ค่าใช้จ่ายเงินสดย่อย)','เงินเติมกองเงินสดย่อย'],
  p_synonyms      => ARRAY['รายจ่าย','ค่าใช้จ่าย','เงินออก','ยอดจ่าย','รายจ่ายรวม','expense'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.expense,0))::numeric AS value,
       count(*)::bigint                    AS entry_count
FROM tmc_finance_entries o, __p
WHERE o.org_id = __p.org_id
  AND o.account_id IS DISTINCT FROM '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7'::uuid
  {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","category"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"category","label_th":"หมวด","column":"category"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"category","label_th":"หมวด","column":"category","type":"text_list"},{"key":"entry_date","label_th":"ช่วงวันที่รายการ","column":"entry_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #3 กำไรสุทธิจากสมุดบัญชีหลัก — D4: ข้อมูลอ่อนไหว owner เท่านั้น
SELECT public._bi_seed_metric(
  p_key           => 'tmc.finance_net_profit',
  p_label_th      => 'กำไรสุทธิ (รายรับ − รายจ่าย)',
  p_definition_th => 'ผลต่างระหว่างรายรับกับรายจ่ายในสมุดบัญชีหลัก tmc_finance_entries ตามช่วงเวลาที่เลือก ยึดวันที่รายการ (entry_date) — ตัดรายการของบัญชีเงินสดย่อยออก · เป็นกำไรตามสมุดเงินสด ไม่ใช่กำไรทางบัญชี (ไม่หักค่าเสื่อม ไม่ตัดจ่ายล่วงหน้า) และยังไม่รวมค่าใช้จ่ายที่จ่ายผ่านกองเงินสดย่อย',
  p_grain         => 'entry',
  p_unit          => 'thb',
  p_time_basis    => 'entry_date',
  p_includes      => ARRAY['รายรับลบรายจ่ายของสมุดบัญชีหลัก'],
  p_excludes      => ARRAY['ค่าใช้จ่ายจากกองเงินสดย่อย','ค่าเสื่อมราคา/รายการปรับปรุงทางบัญชี'],
  p_synonyms      => ARRAY['กำไร','กำไรสุทธิ','เหลือเท่าไร','รายรับสุทธิ','กำไรขาดทุน','net profit'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       (sum(coalesce(o.income,0)) - sum(coalesce(o.expense,0)))::numeric AS value,
       sum(coalesce(o.income,0))::numeric                                AS income,
       sum(coalesce(o.expense,0))::numeric                               AS expense
FROM tmc_finance_entries o, __p
WHERE o.org_id = __p.org_id
  AND o.account_id IS DISTINCT FROM '2366c3f9-dcc5-4091-8ab0-c421b77e7fe7'::uuid
  {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","category"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"category","label_th":"หมวด","column":"category"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"category","label_th":"หมวด","column":"category","type":"text_list"},{"key":"entry_date","label_th":"ช่วงวันที่รายการ","column":"entry_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- ===========================================================================
-- B. สมุดเงินสดย่อย (tmc_petty_cash_txns)
-- ===========================================================================

-- #4 ค่าใช้จ่ายเงินสดย่อย
SELECT public._bi_seed_metric(
  p_key           => 'tmc.petty_cash_expense',
  p_label_th      => 'ค่าใช้จ่ายเงินสดย่อย',
  p_definition_th => 'ผลรวมจำนวนเงินของรายการเงินสดย่อยชนิด "จ่าย" (txn_type = expense) ตามช่วงเวลาที่เลือก ยึดวันที่รายการ (txn_date) — ตรงกับ totals.petty.expense บนหน้าภาพรวม TMC · แยกสมุดกับรายจ่ายในสมุดบัญชีหลัก จึงต้องไม่นำสองยอดมาบวกกันโดยไม่ระบุ',
  p_grain         => 'txn',
  p_unit          => 'thb',
  p_time_basis    => 'txn_date',
  p_includes      => ARRAY['รายการเงินสดย่อยชนิดจ่ายทุกกอง'],
  p_excludes      => ARRAY['เงินเติมกอง (top_up)','รายจ่ายในสมุดบัญชีหลัก'],
  p_synonyms      => ARRAY['เงินสดย่อย','ค่าใช้จ่ายเงินสดย่อย','จ่ายเงินสดย่อย','petty cash','เบิกเงินสด'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.amount,0))::numeric AS value,
       count(*)::bigint                   AS txn_count
FROM tmc_petty_cash_txns o, __p
WHERE o.org_id = __p.org_id
  AND o.txn_type = 'expense'
  {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","category"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"category","label_th":"หมวด","column":"category"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"category","label_th":"หมวด","column":"category","type":"text_list"},{"key":"txn_date","label_th":"ช่วงวันที่รายการ","column":"txn_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #5 เงินเติมกองเงินสดย่อย
SELECT public._bi_seed_metric(
  p_key           => 'tmc.petty_cash_top_up',
  p_label_th      => 'เงินเติมกองเงินสดย่อย',
  p_definition_th => 'ผลรวมจำนวนเงินของรายการเงินสดย่อยชนิด "เติมกอง" (txn_type = top_up) ตามช่วงเวลาที่เลือก ยึดวันที่รายการ (txn_date) — ตรงกับ totals.petty.top_up บนหน้าภาพรวม TMC · เป็นการโยกเงินเข้ากอง ไม่ใช่ค่าใช้จ่ายและไม่ใช่รายได้',
  p_grain         => 'txn',
  p_unit          => 'thb',
  p_time_basis    => 'txn_date',
  p_includes      => ARRAY['รายการเติมกองเงินสดย่อยทุกกอง'],
  p_excludes      => ARRAY['รายการจ่ายจากกอง (expense)'],
  p_synonyms      => ARRAY['เติมเงินสดย่อย','เติมกอง','top up','เงินเข้ากองเงินสดย่อย'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.amount,0))::numeric AS value,
       count(*)::bigint                   AS txn_count
FROM tmc_petty_cash_txns o, __p
WHERE o.org_id = __p.org_id
  AND o.txn_type = 'top_up'
  {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","category"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"category","label_th":"หมวด","column":"category"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"category","label_th":"หมวด","column":"category","type":"text_list"},{"key":"txn_date","label_th":"ช่วงวันที่รายการ","column":"txn_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- ===========================================================================
-- C. การเข้าพัก (tmc_stays) — ยึด check_in เป็นวันอ้างอิงเสมอ
-- ===========================================================================

-- #6 จำนวนการเข้าพัก
SELECT public._bi_seed_metric(
  p_key           => 'tmc.stay_count',
  p_label_th      => 'จำนวนการเข้าพัก',
  p_definition_th => 'นับจำนวนรายการเข้าพักใน tmc_stays ตามช่วงเวลาที่เลือก ยึดวันเช็คอิน (check_in) — ตรงกับ totals.stays.count บนหน้าภาพรวม TMC · นับทุกประเภทการเข้าพักรวมทั้งพักฟรี/อินฟลูเอนเซอร์/ผู้บริหาร ถ้าต้องการเฉพาะที่มีรายได้ให้กรองประเภทการเข้าพัก',
  p_grain         => 'stay',
  p_unit          => 'count',
  p_unit_decimals => 0,
  p_time_basis    => 'check_in',
  p_includes      => ARRAY['ทุกรายการเข้าพักที่บันทึกไว้','รวมการพักฟรี/อินฟลู/ผู้บริหาร'],
  p_excludes      => ARRAY['การจองที่ยังไม่ได้บันทึกเป็นการเข้าพัก'],
  p_synonyms      => ARRAY['จำนวนการเข้าพัก','กี่หลัง','กี่ครั้ง','จำนวนบุ๊กกิ้ง','จำนวนแขก','stays'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       count(*)::bigint AS value
FROM tmc_stays o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","booking_channel","stay_type","group_type"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type"},{"key":"group_type","label_th":"ประเภทกลุ่ม","column":"group_type"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel","type":"text_list"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type","type":"text_list"},{"key":"check_in","label_th":"ช่วงวันเช็คอิน","column":"check_in","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #7 จำนวนคืนเข้าพัก
SELECT public._bi_seed_metric(
  p_key           => 'tmc.stay_nights',
  p_label_th      => 'จำนวนคืนเข้าพัก',
  p_definition_th => 'ผลรวมจำนวนคืนที่พักจริงในช่วงที่เลือก — แตกการเข้าพักเป็นรายคืน คืนของวันที่ใดนับเข้าวันที่/เดือนนั้น (เช่น พัก 31 ธ.ค. ถึง 2 ม.ค. = ธ.ค. 1 คืน + ม.ค. 1 คืน) ถ้าไม่มีวันเช็คเอาต์ถือเป็น 1 คืน — สูตรเดียวกับหน้าภาพรวม TMC (nightsPerMonth ใน dashboard.ts) ไม่ได้ใช้ช่อง nights ที่กรอกมือ',
  p_grain         => 'stay',
  p_unit          => 'days',
  p_unit_decimals => 0,
  p_time_basis    => 'night_date',
  p_includes      => ARRAY['ทุกคืนที่พักจริงในช่วงที่เลือก รวมคืนของ stay ที่เช็คอินก่อนช่วงแต่พักต่อเข้ามา'],
  p_excludes      => ARRAY['คืนที่อยู่นอกช่วงเวลา (ตัดตามวันที่พักจริง ไม่นับทั้งก้อนที่วันเช็คอิน)'],
  p_synonyms      => ARRAY['จำนวนคืน','กี่คืน','คืนเข้าพัก','room nights','ยอดคืน'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       count(*)::bigint AS value,
       count(DISTINCT o.id)::bigint AS stay_count
FROM (
  SELECT s.*, n.night_date::date AS night_date
  FROM tmc_stays s
  CROSS JOIN LATERAL generate_series(s.check_in, coalesce(s.check_out, s.check_in + 1) - 1, interval '1 day') AS n(night_date)
) o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","booking_channel","stay_type"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel","type":"text_list"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type","type":"text_list"},{"key":"check_in","label_th":"ช่วงวันเช็คอิน","column":"check_in","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #8 รายได้ค่าห้อง
SELECT public._bi_seed_metric(
  p_key           => 'tmc.stay_room_revenue',
  p_label_th      => 'รายได้ค่าห้องพัก',
  p_definition_th => 'ผลรวมค่าห้อง (room_rate) ของการเข้าพักในช่วงที่เลือก ยึดวันเช็คอิน (check_in) — ตรงกับ totals.stays.revenue บนหน้าภาพรวม TMC · เป็นยอดค่าห้องที่บันทึกไว้ต่อการเข้าพัก ไม่รวมอาหาร/เครื่องดื่ม ไม่รวมเงินมัดจำ และไม่ได้หักส่วนลดโปรโมชัน (promotion_pct) ออกอีกชั้น',
  p_grain         => 'stay',
  p_unit          => 'thb',
  p_time_basis    => 'check_in',
  p_includes      => ARRAY['ค่าห้องของทุกการเข้าพักในช่วงที่เลือก'],
  p_excludes      => ARRAY['อาหาร/เครื่องดื่ม/หมูกระทะ/บาร์บีคิว','เงินมัดจำ','ส่วนลดโปรโมชันที่ยังไม่หัก'],
  p_synonyms      => ARRAY['รายได้ค่าห้อง','ค่าห้อง','ยอดค่าห้อง','room revenue','รายได้ที่พัก'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.room_rate,0))::numeric AS value,
       count(*)::bigint                      AS stay_count
FROM tmc_stays o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","booking_channel","stay_type"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel","type":"text_list"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type","type":"text_list"},{"key":"check_in","label_th":"ช่วงวันเช็คอิน","column":"check_in","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #9 รายได้อาหารและเครื่องดื่ม
SELECT public._bi_seed_metric(
  p_key           => 'tmc.stay_fnb_revenue',
  p_label_th      => 'รายได้อาหารและเครื่องดื่ม',
  p_definition_th => 'ผลรวมยอดอาหาร เครื่องดื่ม หมูกระทะ และบาร์บีคิว (food_amount + drink_amount + mookata_amount + bbq_amount) ของการเข้าพักในช่วงที่เลือก ยึดวันเช็คอิน (check_in) — สูตรเดียวกับช่อง "อาหาร" บนกราฟรายเดือนของหน้าภาพรวม TMC',
  p_grain         => 'stay',
  p_unit          => 'thb',
  p_time_basis    => 'check_in',
  p_includes      => ARRAY['อาหาร','เครื่องดื่ม','หมูกระทะ','บาร์บีคิว'],
  p_excludes      => ARRAY['ค่าห้องพัก','เงินมัดจำ'],
  p_synonyms      => ARRAY['รายได้อาหาร','ค่าอาหาร','อาหารและเครื่องดื่ม','หมูกระทะ','บาร์บีคิว','f&b'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.food_amount,0) + coalesce(o.drink_amount,0)
           + coalesce(o.mookata_amount,0) + coalesce(o.bbq_amount,0))::numeric AS value,
       count(*)::bigint AS stay_count
FROM tmc_stays o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","booking_channel","stay_type"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel","type":"text_list"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type","type":"text_list"},{"key":"check_in","label_th":"ช่วงวันเช็คอิน","column":"check_in","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #10 ราคาค่าห้องเฉลี่ยต่อคืน (ADR)
SELECT public._bi_seed_metric(
  p_key           => 'tmc.stay_adr',
  p_label_th      => 'ราคาห้องเฉลี่ยต่อคืน',
  p_definition_th => 'ค่าห้องเฉลี่ยต่อคืนที่พักจริงในช่วงที่เลือก — แตกการเข้าพักเป็นรายคืน (ค่าห้องของ stay ถูกเฉลี่ยเท่ากันต่อคืน) คืนของวันที่ใดนับเข้าวันที่/เดือนนั้น สูตรคืนชุดเดียวกับหน้าภาพรวม TMC · การพักฟรีหรือพักของผู้บริหารถูกนับเป็นคืนด้วย จึงกดค่าเฉลี่ยลง ถ้าต้องการเฉพาะที่มีรายได้ให้กรองประเภทการเข้าพักเป็น paid',
  p_grain         => 'stay',
  p_unit          => 'thb',
  p_time_basis    => 'night_date',
  p_includes      => ARRAY['ค่าห้องเฉลี่ยต่อคืน (ค่าห้องของแต่ละ stay หารจำนวนคืนของ stay นั้น) เฉลี่ยทุกคืนในช่วง'],
  p_excludes      => ARRAY['อาหาร/เครื่องดื่ม','เงินมัดจำ'],
  p_synonyms      => ARRAY['ราคาเฉลี่ยต่อคืน','ค่าห้องเฉลี่ย','adr','average daily rate','เฉลี่ยต่อคืน'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       (sum(o.night_rate) / NULLIF(count(*), 0))::numeric AS value,
       sum(o.night_rate)::numeric AS room_revenue,
       count(*)::bigint AS nights
FROM (
  SELECT s.*, n.night_date::date AS night_date,
         (coalesce(s.room_rate, 0)
          / GREATEST(coalesce(s.check_out, s.check_in + 1) - s.check_in, 1))::numeric AS night_rate
  FROM tmc_stays s
  CROSS JOIN LATERAL generate_series(s.check_in, coalesce(s.check_out, s.check_in + 1) - 1, interval '1 day') AS n(night_date)
) o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","booking_channel","stay_type"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel","type":"text_list"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type","type":"text_list"},{"key":"check_in","label_th":"ช่วงวันเช็คอิน","column":"check_in","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #11 จำนวนคืนเฉลี่ยต่อการเข้าพัก
SELECT public._bi_seed_metric(
  p_key           => 'tmc.stay_avg_nights',
  p_label_th      => 'จำนวนคืนเฉลี่ยต่อการเข้าพัก',
  p_definition_th => 'จำนวนคืนรวมหารด้วยจำนวนการเข้าพักในช่วงที่เลือก ยึดวันเช็คอิน (check_in) — ใช้สูตรจำนวนคืนชุดเดียวกับหน้าภาพรวม TMC (วันเช็คเอาต์ลบวันเช็คอิน ไม่มีเช็คเอาต์ถือเป็น 1 คืน)',
  p_grain         => 'stay',
  p_unit          => 'days',
  p_unit_decimals => 1,
  p_time_basis    => 'check_in',
  p_includes      => ARRAY['ทุกการเข้าพักในช่วงที่เลือก'],
  p_excludes      => ARRAY['การจองที่ยังไม่ได้บันทึกเป็นการเข้าพัก'],
  p_synonyms      => ARRAY['พักเฉลี่ยกี่คืน','คืนเฉลี่ย','ระยะเวลาเข้าพักเฉลี่ย','average length of stay'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       (sum(CASE WHEN o.check_out IS NULL THEN 1 ELSE GREATEST(o.check_out - o.check_in, 0) END)::numeric
        / NULLIF(count(*),0))::numeric AS value,
       count(*)::bigint AS stay_count
FROM tmc_stays o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","booking_channel","stay_type"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"booking_channel","label_th":"ช่องทางการจอง","column":"booking_channel","type":"text_list"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type","type":"text_list"},{"key":"check_in","label_th":"ช่วงวันเช็คอิน","column":"check_in","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #12 เงินมัดจำที่ยังไม่ได้คืนแขก
SELECT public._bi_seed_metric(
  p_key           => 'tmc.stay_deposit_outstanding',
  p_label_th      => 'เงินมัดจำที่ยังไม่ได้คืน',
  p_definition_th => 'ผลรวมเงินมัดจำที่รับมาลบด้วยเงินมัดจำที่คืนแขกไปแล้ว (deposit_received − deposit_returned) ของการเข้าพักในช่วงที่เลือก ยึดวันเช็คอิน (check_in) — ยอดคงเหลือนี้คือเงินของแขกที่ยังถืออยู่ ไม่ใช่รายได้ ห้ามนำไปรวมกับรายได้ค่าห้อง',
  p_grain         => 'stay',
  p_unit          => 'thb',
  p_time_basis    => 'check_in',
  p_includes      => ARRAY['เงินมัดจำที่รับมาแล้วยังไม่ได้คืน'],
  p_excludes      => ARRAY['ค่าห้อง','อาหาร/เครื่องดื่ม','เงินมัดจำที่คืนครบแล้ว (หักออกไปแล้ว)'],
  p_synonyms      => ARRAY['เงินมัดจำ','มัดจำค้างคืน','ค้างคืนมัดจำ','deposit','เงินประกันความเสียหาย'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       (sum(coalesce(o.deposit_received,0)) - sum(coalesce(o.deposit_returned,0)))::numeric AS value,
       sum(coalesce(o.deposit_received,0))::numeric AS deposit_received,
       sum(coalesce(o.deposit_returned,0))::numeric AS deposit_returned
FROM tmc_stays o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["property_code","stay_type"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type"}]'::jsonb,
  p_filters       => '[{"key":"property_code","label_th":"แปลง/ที่พัก","column":"property_code","type":"text_list"},{"key":"stay_type","label_th":"ประเภทการเข้าพัก","column":"stay_type","type":"text_list"},{"key":"check_in","label_th":"ช่วงวันเช็คอิน","column":"check_in","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'tmc',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- ---------------------------------------------------------------------------
-- เก็บกวาด helper (ไม่ทิ้งฟังก์ชันค้างไว้ใน public)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._bi_seed_metric(
  text, text, text, text, text, text, text, text[], text, text, text, int,
  text[], text[], text[], jsonb, jsonb, text[], text[], jsonb, jsonb, text, boolean, int
);
