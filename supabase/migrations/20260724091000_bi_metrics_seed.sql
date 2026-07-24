-- ============================================================================
-- bi — seed semantic layer (bi_metrics) · Phase 1 (gov_procure + กองทุน/นักลงทุน)
-- Contract: specs/bi.md §7 (metric inventory) · Decisions §11 D1–D5
--   D1 = metric ที่เป็น "มูลค่า" แตกเป็น 2 key (_incl_vat / _excl_vat) ห้าม default เงียบ
--   D2 = ปีปฏิทินเป็นค่าตั้งต้น · fiscal_year (ต.ค.–ก.ย.) รองรับเมื่อผู้ใช้ระบุ
--   D4 = กำไร/ต้นทุน/%กำไร/คอมมิชชั่น/กองทุน/ปันผล = allowed_roles ['owner'] เท่านั้น
--   D5 = ไม่มี "หมวดครุภัณฑ์" · "งบผูกพัน vs เบิกจ่าย" = มูลค่าพอร์ต vs เงินรับจริง
--        · "งานค้าง" ใช้ milestone ล่าสุดที่มีค่า · "คอมค้างจ่าย" ยึด commission_payment_date IS NULL
--
-- ⚠️ ทุก metric ในไฟล์นี้ seed เป็น status='draft' ทั้ง 29 ตัว — ไม่มีข้อยกเว้น
--    เหตุผล (contract §3.1 ข้อ 6 + §8.2): metric ตอบได้เฉพาะเมื่อ golden test เขียว
--    และเจ้าของธุรกิจเซ็นรับ definition_th แล้ว (gate G4) · migration ตั้ง verified เอง
--    = ข้ามด่านที่ spec ออกแบบมากันโดยเฉพาะ (ช่วงระหว่าง apply prod ถึง B6a
--    บอทจะตอบตัวเลขธุรกิจที่ยังไม่มีมนุษย์ยืนยันนิยาม)
--    → เปิดใช้งานผ่าน `supabase/migrations/_bi_activate_metrics.sql` หลังผ่าน B6a + G4
--
--    หมายเหตุข้อมูลจริงของ p2p-x-89 ณ 2026-07-24 (17 orders, 2026-06→07):
--    milestone dates (contract/payment_order/delivery/receipt) = ว่างทั้งหมด ·
--    net_profit_89 / commission = 0 · customer_name distinct = 1 · ไม่มีข้อมูลปีก่อน
--    → metric ที่พึ่งของเหล่านี้ยังเปิดไม่ได้แม้ผ่าน G4 (รายชื่อ + เหตุผลอยู่ใน _bi_activate_metrics.sql)
--
--    ⚠️ ทุก metric ต้องรัน `pnpm bi:embed` ก่อนจึงจะถูก match (embedding = NULL ตอน seed)
--
-- idempotent: INSERT ... ON CONFLICT (key) DO UPDATE (ไม่แตะ embedding / verified_*)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- helper ชั่วคราว (drop ท้ายไฟล์) — ลดโอกาสพิมพ์คอลัมน์สลับตำแหน่ง
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
  p_owner_label       text    DEFAULT 'ผอ.จัดซื้อ p2p-x-89',
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
-- A. gov_procure — จำนวนงาน / มูลค่าพอร์ต (D1: มูลค่าแตก incl/excl VAT)
-- ===========================================================================

-- #1 จำนวนงาน — VERIFIED (นับแถวตรงกับ computeSummary().order_count)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.order_count',
  p_label_th      => 'จำนวนงานจัดซื้อ',
  p_definition_th => 'นับจำนวนใบงานใน gov_procure_orders ของหน่วยงานนี้ ตามช่วงเวลาที่เลือก (ยึดวันเริ่มงาน start_date) — ตรงกับ computeSummary().order_count · หมายเหตุ: ปัจจุบันข้อมูลมีหน่วยงานผู้ซื้อเพียงรายเดียว มิติ "หน่วยงานผู้ซื้อ" จึงยังไม่ให้ข้อมูลที่แยกแยะได้',
  p_grain         => 'order',
  p_unit          => 'count',
  p_unit_decimals => 0,
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกใบงานทุกขั้นตอน รวมใบที่ยังไม่กรอกราคา'],
  p_excludes      => ARRAY['ใบงานของหน่วยงานอื่น','ใบงานที่ start_date ว่าง เมื่อมีการระบุช่วงเวลา'],
  p_synonyms      => ARRAY['จำนวนงาน','กี่งาน','กี่ใบ','จำนวนใบงาน','order count','จำนวนโครงการ'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       count(*)::bigint AS value
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["stage","company","department","customer_name"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year","fiscal_year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage"},{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name","type":"text"},{"key":"price_incl_vat","label_th":"ช่วงมูลค่า (รวม VAT)","column":"price_incl_vat","type":"number_range"},{"key":"price_excl_vat","label_th":"ช่วงมูลค่า (ก่อน VAT)","column":"price_excl_vat","type":"number_range"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #2a มูลค่าพอร์ต (รวม VAT) — VERIFIED
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.pipeline_value_incl_vat',
  p_label_th      => 'มูลค่าพอร์ตรวม (รวม VAT)',
  p_definition_th => 'ผลรวมยอดเสนอราคารวม VAT (price_incl_vat) ของทุกใบงานในช่วงที่เลือก ยึดวันเริ่มงาน (start_date) — ตรงกับ pipelineValue() บนหน้าจัดซื้อ · ใบที่ยังไม่กรอกราคาถือเป็น 0 (ปัจจุบันมี 4 ใบจาก 17 ที่ยังไม่กรอก price_incl_vat) คอลัมน์ priced_count บอกจำนวนใบที่มีราคาจริง',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกขั้นตอนของงาน (quotation ถึง closed)','ยอดรวมภาษีมูลค่าเพิ่ม'],
  p_excludes      => ARRAY['ใบที่ยังไม่กรอกราคา (นับเป็น 0)','ใบงานของหน่วยงานอื่น'],
  p_synonyms      => ARRAY['มูลค่าพอร์ต','ยอดรวมงาน','มูลค่างานทั้งหมด','ยอดขายรวม VAT','pipeline value','มูลค่ารวม VAT'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.price_incl_vat,0))::numeric AS value,
       count(*)::bigint                           AS order_count,
       count(o.price_incl_vat)::bigint            AS priced_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["stage","company","department","customer_name"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year","fiscal_year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage"},{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name","type":"text"},{"key":"price_incl_vat","label_th":"ช่วงมูลค่า (รวม VAT)","column":"price_incl_vat","type":"number_range"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #2b มูลค่าพอร์ต (ก่อน VAT) — VERIFIED (ข้อมูลจริงกรอกครบ 17/17)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.pipeline_value_excl_vat',
  p_label_th      => 'มูลค่าพอร์ตรวม (ก่อน VAT)',
  p_definition_th => 'ผลรวมยอดก่อนภาษีมูลค่าเพิ่ม (price_excl_vat) ของทุกใบงานในช่วงที่เลือก ยึดวันเริ่มงาน (start_date) · ใบที่ยังไม่กรอกราคาถือเป็น 0 (ปัจจุบันกรอกครบทุกใบ) คอลัมน์ priced_count บอกจำนวนใบที่มีราคาจริง',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกขั้นตอนของงาน (quotation ถึง closed)'],
  p_excludes      => ARRAY['ภาษีมูลค่าเพิ่ม','ใบที่ยังไม่กรอกราคา (นับเป็น 0)'],
  p_synonyms      => ARRAY['มูลค่าพอร์ตก่อน VAT','ยอดก่อนภาษี','ยอดไม่รวม VAT','มูลค่างานก่อน VAT','excl vat'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.price_excl_vat,0))::numeric AS value,
       count(*)::bigint                           AS order_count,
       count(o.price_excl_vat)::bigint            AS priced_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["stage","company","department","customer_name"]},"time_grain":{"type":"enum","values":["day","week","month","quarter","year","fiscal_year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage"},{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name","type":"text"},{"key":"price_excl_vat","label_th":"ช่วงมูลค่า (ก่อน VAT)","column":"price_excl_vat","type":"number_range"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['day','week','month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #3a ไปป์ไลน์ตามขั้นตอน (รวม VAT) — VERIFIED · คืนครบ 6 stage เสมอ (ตรง pipelineByStage())
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.pipeline_by_stage_incl_vat',
  p_label_th      => 'ไปป์ไลน์ตามขั้นตอน (รวม VAT)',
  p_definition_th => 'จำนวนใบงานและผลรวมมูลค่ารวม VAT แยกตามขั้นตอนของงาน คืนครบทั้ง 6 ขั้นตอนเสมอแม้ขั้นตอนนั้นไม่มีงาน — ตรงกับ pipelineByStage() บนหน้าจัดซื้อ · เป็นภาพ ณ ปัจจุบัน (ระบุช่วงวันได้ตามวันเริ่มงาน)',
  p_grain         => 'stage',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทั้ง 6 ขั้นตอน: quotation, contracted, procuring, delivered, paid, closed'],
  p_excludes      => ARRAY['ใบที่ยังไม่กรอกราคา (นับเป็น 0)'],
  p_synonyms      => ARRAY['ไปป์ไลน์','pipeline','แยกตามสถานะ','funnel','ขั้นตอนไหนมีงานเท่าไร','สถานะงาน'],
  p_sql_template  => $tpl$
SELECT s.stage                                AS dimension,
       coalesce(t.value,0)::numeric           AS value,
       coalesce(t.order_count,0)::bigint      AS order_count
FROM (VALUES ('quotation'),('contracted'),('procuring'),('delivered'),('paid'),('closed')) AS s(stage)
LEFT JOIN (
  SELECT o.stage                                   AS stage,
         sum(coalesce(o.price_incl_vat,0))::numeric AS value,
         count(*)::bigint                           AS order_count
  FROM gov_procure_orders o, __p
  WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
  GROUP BY o.stage
) t ON t.stage = s.stage
ORDER BY array_position(ARRAY['quotation','contracted','procuring','delivered','paid','closed']::text[], s.stage)
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_default_view  => '{"chart_type":"funnel","dimension":"stage","time_grain":null,"period":"all"}'::jsonb,
  p_chart_hint    => 'funnel',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #3b ไปป์ไลน์ตามขั้นตอน (ก่อน VAT) — VERIFIED
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.pipeline_by_stage_excl_vat',
  p_label_th      => 'ไปป์ไลน์ตามขั้นตอน (ก่อน VAT)',
  p_definition_th => 'จำนวนใบงานและผลรวมมูลค่าก่อน VAT แยกตามขั้นตอนของงาน คืนครบทั้ง 6 ขั้นตอนเสมอแม้ขั้นตอนนั้นไม่มีงาน · เป็นภาพ ณ ปัจจุบัน (ระบุช่วงวันได้ตามวันเริ่มงาน)',
  p_grain         => 'stage',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทั้ง 6 ขั้นตอน: quotation, contracted, procuring, delivered, paid, closed'],
  p_excludes      => ARRAY['ภาษีมูลค่าเพิ่ม'],
  p_synonyms      => ARRAY['ไปป์ไลน์ก่อน VAT','pipeline ก่อนภาษี','แยกตามสถานะ ก่อน VAT'],
  p_sql_template  => $tpl$
SELECT s.stage                                AS dimension,
       coalesce(t.value,0)::numeric           AS value,
       coalesce(t.order_count,0)::bigint      AS order_count
FROM (VALUES ('quotation'),('contracted'),('procuring'),('delivered'),('paid'),('closed')) AS s(stage)
LEFT JOIN (
  SELECT o.stage                                   AS stage,
         sum(coalesce(o.price_excl_vat,0))::numeric AS value,
         count(*)::bigint                           AS order_count
  FROM gov_procure_orders o, __p
  WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
  GROUP BY o.stage
) t ON t.stage = s.stage
ORDER BY array_position(ARRAY['quotation','contracted','procuring','delivered','paid','closed']::text[], s.stage)
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_default_view  => '{"chart_type":"funnel","dimension":"stage","time_grain":null,"period":"all"}'::jsonb,
  p_chart_hint    => 'funnel',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #11a สัดส่วนตามบริษัทรับงาน (รวม VAT) — VERIFIED (ไม่ hardcode รายชื่อบริษัท)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.by_company_incl_vat',
  p_label_th      => 'สัดส่วนตามบริษัทรับงาน (รวม VAT)',
  p_definition_th => 'จำนวนใบงานและผลรวมมูลค่ารวม VAT แยกตามบริษัทที่รับงาน (คอลัมน์ company) โดยดึงรายชื่อบริษัทจากข้อมูลจริง ไม่ได้กำหนดรายชื่อไว้ตายตัว · ใบที่ไม่ได้ระบุบริษัทจะรวมอยู่ในกลุ่ม (ไม่ระบุ)',
  p_grain         => 'company',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกขั้นตอนของงาน'],
  p_excludes      => ARRAY['ใบที่ยังไม่กรอกราคา (นับเป็น 0)'],
  p_synonyms      => ARRAY['แยกตามบริษัท','บริษัทไหนรับงานมากสุด','สัดส่วนบริษัท','by company','89 กับ p2p'],
  p_sql_template  => $tpl$
SELECT coalesce(o.company, '(ไม่ระบุ)')        AS dimension,
       sum(coalesce(o.price_incl_vat,0))::numeric AS value,
       count(*)::bigint                           AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_default_view  => '{"chart_type":"donut","dimension":"company","time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'donut',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #11b สัดส่วนตามบริษัทรับงาน (ก่อน VAT) — VERIFIED
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.by_company_excl_vat',
  p_label_th      => 'สัดส่วนตามบริษัทรับงาน (ก่อน VAT)',
  p_definition_th => 'จำนวนใบงานและผลรวมมูลค่าก่อน VAT แยกตามบริษัทที่รับงาน (คอลัมน์ company) โดยดึงรายชื่อบริษัทจากข้อมูลจริง ไม่ได้กำหนดรายชื่อไว้ตายตัว · ใบที่ไม่ได้ระบุบริษัทจะรวมอยู่ในกลุ่ม (ไม่ระบุ)',
  p_grain         => 'company',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกขั้นตอนของงาน'],
  p_excludes      => ARRAY['ภาษีมูลค่าเพิ่ม'],
  p_synonyms      => ARRAY['แยกตามบริษัท ก่อน VAT','สัดส่วนบริษัทก่อนภาษี'],
  p_sql_template  => $tpl$
SELECT coalesce(o.company, '(ไม่ระบุ)')        AS dimension,
       sum(coalesce(o.price_excl_vat,0))::numeric AS value,
       count(*)::bigint                           AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_default_view  => '{"chart_type":"donut","dimension":"company","time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'donut',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #14 รายการงาน (drill-down) — VERIFIED · no_summarize (ห้ามส่งเข้า LLM ตาม §5 data boundary)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.orders_detail',
  p_label_th      => 'รายการงานจัดซื้อ (รายตัว)',
  p_definition_th => 'รายการใบงานทีละแถวตามเงื่อนไขที่เลือก แสดงลำดับ หน่วยงาน กอง บริษัทรับงาน รายการพัสดุ ขั้นตอน มูลค่า (ทั้งรวม VAT และก่อน VAT) และวันที่หมุดสำคัญ — ไม่แสดงกำไร/ต้นทุน/คอมมิชชั่น',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกใบงานที่ตรงเงื่อนไข'],
  p_excludes      => ARRAY['ข้อมูลกำไร ต้นทุน และคอมมิชชั่น'],
  p_synonyms      => ARRAY['ขอดูรายตัว','รายการงาน','ลิสต์งาน','รายละเอียดงาน','ขอตาราง','drill down'],
  p_sql_template  => $tpl$
SELECT o.seq_no, o.customer_name, o.department, o.company, o.product_description, o.stage,
       o.price_incl_vat, o.price_excl_vat, o.net_receivable,
       o.start_date, o.contract_date, o.payment_order_date, o.delivery_date, o.receipt_date
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
ORDER BY o.start_date DESC NULLS LAST, o.seq_no DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name","type":"text"},{"key":"price_incl_vat","label_th":"ช่วงมูลค่า (รวม VAT)","column":"price_incl_vat","type":"number_range"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_default_view  => '{"chart_type":"table","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'table',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_no_summarize  => true,
  p_status        => 'draft'
);

-- ===========================================================================
-- B. gov_procure — ต้นทุน (owner-only ตาม D4)
-- ===========================================================================

-- ต้นทุนซื้อของ (cost_price) — VERIFIED (ข้อมูลจริงกรอก 12/17 ใบ)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.purchase_cost_total',
  p_label_th      => 'ต้นทุนซื้อของรวม',
  p_definition_th => 'ผลรวมราคาทุน (cost_price = เงินที่จ่ายซื้อของ) ของใบงานในช่วงที่เลือก ยึดวันเริ่มงาน (start_date) · ใบที่ยังไม่กรอกราคาทุนถือเป็น 0 คอลัมน์ costed_count บอกจำนวนใบที่กรอกต้นทุนแล้ว (ปัจจุบัน 12 จาก 17 ใบ)',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ราคาทุนที่บันทึกในใบงาน'],
  p_excludes      => ARRAY['ค่าขนส่ง ค่าดำเนินการ และค่าใช้จ่ายภายในอื่น','ใบที่ยังไม่กรอกต้นทุน (นับเป็น 0)'],
  p_synonyms      => ARRAY['ต้นทุน','ทุนซื้อของ','ราคาทุน','cost','ต้นทุนรวม'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.cost_price,0))::numeric AS value,
       count(*)::bigint                        AS order_count,
       count(o.cost_price)::bigint             AS costed_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["stage","company","department"]},"time_grain":{"type":"enum","values":["month","quarter","year","fiscal_year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage"},{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- #16 ทุนรวม 89 (total_cost_89) — DRAFT: ข้อมูลจริงยังไม่กรอก (รอเปิดเมื่อมีข้อมูล)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.cost_total',
  p_label_th      => 'ทุนรวมของงาน (รวมค่าดำเนินการ)',
  p_definition_th => 'ผลรวมทุนรวม (total_cost_89 = ราคาทุน + ทอนลูกค้า + petty cash + ค่าขนส่ง + ค่าดำเนินการ) ของใบงานในช่วงที่เลือก ยึดวันเริ่มงาน · ปัจจุบันข้อมูลจริงยังไม่กรอกช่องนี้ metric จึงเป็นสถานะร่างจนกว่าจะมีข้อมูล',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุนรวมทุกรายการที่บันทึกในช่อง total_cost_89'],
  p_excludes      => ARRAY['ใบที่ยังไม่กรอกทุนรวม (นับเป็น 0)'],
  p_synonyms      => ARRAY['ทุนรวม','ต้นทุนรวมทั้งหมด','total cost','ต้นทุน 89'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.total_cost_89,0))::numeric AS value,
       count(*)::bigint                           AS order_count,
       count(o.total_cost_89)::bigint             AS costed_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["stage","company","department"]},"time_grain":{"type":"enum","values":["month","quarter","year","fiscal_year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage"},{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"start_date","label_th":"ช่วงวันเริ่มงาน","column":"start_date","type":"date_range"}]'::jsonb,
  p_time_grains   => ARRAY['month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- ===========================================================================
-- C. gov_procure — เงินค้างรับ / เงินรับจริง (DRAFT: milestone dates ยังว่างทั้งหมด)
-- ===========================================================================

-- #4 เงินค้างรับ
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.receivable_outstanding',
  p_label_th      => 'เงินค้างรับ (ส่งของแล้วยังไม่รับเช็ค)',
  p_definition_th => 'ผลรวมยอดสุทธิที่ต้องรับจากภาครัฐ (net_receivable) ของใบงานที่อยู่ในขั้นตอน "ส่งมอบแล้ว" (delivered) ซึ่งยังไม่ได้รับเช็ค — ตรงกับ receivable_total ใน computeSummary() · เป็นภาพ ณ ปัจจุบัน ไม่อิงช่วงเวลา',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => NULL,
  p_includes      => ARRAY['เฉพาะใบงานขั้นตอน delivered'],
  p_excludes      => ARRAY['ใบงานที่รับเช็คแล้ว (paid/closed)','ใบงานที่ยังไม่ส่งมอบ'],
  p_synonyms      => ARRAY['เงินค้างรับ','ลูกหนี้','ยังไม่ได้รับเงิน','ค้างรับเท่าไร','receivable'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.net_receivable,0))::numeric AS value,
       count(*)::bigint                            AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id AND o.stage = 'delivered' {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"dimension":{"type":"enum","values":["company","department","customer_name"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"}]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_comparisons   => ARRAY['none']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"snapshot"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #5 เงินค้างรับเกินกำหนด (isOverdue: aging > sla_threshold)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.receivable_overdue',
  p_label_th      => 'เงินค้างรับเกินกำหนด',
  p_definition_th => 'ผลรวมยอดค้างรับของใบงานขั้นตอน "ส่งมอบแล้ว" ที่นับจากวันส่งมอบ (delivery_date) ถึงวันนี้แล้วเกินเกณฑ์ที่ตั้งไว้ในระบบ (gov_procure_settings.sla_threshold ค่าเริ่มต้น 30 วัน) — ตรงกับ isOverdue() · เป็นภาพ ณ ปัจจุบัน',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => NULL,
  p_includes      => ARRAY['ใบงาน delivered ที่มีวันส่งมอบ และค้างเกินเกณฑ์'],
  p_excludes      => ARRAY['ใบงานที่ไม่มีวันส่งมอบ','ใบงานที่รับเช็คแล้ว'],
  p_synonyms      => ARRAY['ค้างเกินกำหนด','เลยกำหนด','overdue','ค้างนาน','เกิน sla'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.net_receivable,0))::numeric AS value,
       count(*)::bigint                            AS order_count,
       max(CURRENT_DATE - o.delivery_date)::int    AS max_aging_days
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id
  AND o.stage = 'delivered'
  AND o.delivery_date IS NOT NULL
  AND (CURRENT_DATE - o.delivery_date) >
      coalesce((SELECT s.sla_threshold FROM gov_procure_settings s WHERE s.org_id = __p.org_id), 30)
  {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"dimension":{"type":"enum","values":["company","customer_name"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"}]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_comparisons   => ARRAY['none']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"snapshot"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #6 อายุหนี้ค้างรับตามช่วง
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.receivable_aging_buckets',
  p_label_th      => 'อายุหนี้ค้างรับตามช่วงวัน',
  p_definition_th => 'แบ่งใบงานที่ส่งมอบแล้วแต่ยังไม่รับเช็ค ออกเป็นช่วงอายุหนี้ 0-30 / 31-60 / 61-90 / มากกว่า 90 วัน โดยนับจากวันส่งมอบ (delivery_date) ถึงวันนี้ — วิธีนับเดียวกับ computeAging()',
  p_grain         => 'aging_bucket',
  p_unit          => 'thb',
  p_time_basis    => NULL,
  p_includes      => ARRAY['ใบงาน delivered ที่มีวันส่งมอบ'],
  p_excludes      => ARRAY['ใบงานที่ไม่มีวันส่งมอบ'],
  p_synonyms      => ARRAY['อายุหนี้','aging','ค้างมากี่วัน','ช่วงอายุหนี้'],
  p_sql_template  => $tpl$
SELECT CASE
         WHEN (CURRENT_DATE - o.delivery_date) <= 30 THEN '0-30'
         WHEN (CURRENT_DATE - o.delivery_date) <= 60 THEN '31-60'
         WHEN (CURRENT_DATE - o.delivery_date) <= 90 THEN '61-90'
         ELSE '90+'
       END                                          AS dimension,
       sum(coalesce(o.net_receivable,0))::numeric   AS value,
       count(*)::bigint                             AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id AND o.stage = 'delivered' AND o.delivery_date IS NOT NULL {{filters}}
GROUP BY 1
ORDER BY 1
$tpl$,
  p_param_schema  => '{"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_comparisons   => ARRAY['none']::text[],
  p_default_view  => '{"chart_type":"bar","dimension":"bucket","time_grain":null,"period":"snapshot"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #7 เงินรับจริง (D5-b: ใช้คู่กับมูลค่าพอร์ตแทน "งบผูกพัน vs เบิกจ่าย")
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.revenue_collected',
  p_label_th      => 'เงินรับจริง',
  p_definition_th => 'ผลรวมยอดสุทธิที่รับจริงจากภาครัฐ (net_receivable) ของใบงานที่รับเช็คแล้ว (ขั้นตอน paid หรือ closed) ยึดวันรับเช็ค (receipt_date) · ใช้คู่กับ "มูลค่าพอร์ตรวม" เพื่อดูสัดส่วนงานที่แปลงเป็นเงินสดแล้ว',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => 'receipt_date',
  p_includes      => ARRAY['ใบงานขั้นตอน paid และ closed'],
  p_excludes      => ARRAY['ใบงานที่ยังไม่รับเช็ค','ภาษีหัก ณ ที่จ่ายที่ถูกหักไปแล้ว (ยอดเป็นสุทธิหลังหัก)'],
  p_synonyms      => ARRAY['เงินเข้า','รับเงินแล้ว','เก็บเงินได้เท่าไร','ยอดเก็บเงิน','เบิกจ่ายแล้ว'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.net_receivable,0))::numeric AS value,
       count(*)::bigint                            AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id AND o.stage IN ('paid','closed') {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["company","department","customer_name"]},"time_grain":{"type":"enum","values":["month","quarter","year","fiscal_year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"}]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => ARRAY['month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"line","dimension":null,"time_grain":"month","period":"this_year"}'::jsonb,
  p_chart_hint    => 'line',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- #13 ระยะเวลาเฉลี่ยต่องาน (computeDuration)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.cycle_time_avg',
  p_label_th      => 'ระยะเวลาเฉลี่ยต่องาน (วัน)',
  p_definition_th => 'ค่าเฉลี่ยจำนวนวันจากวันเซ็นสัญญา (contract_date) ถึงวันรับเช็ค (receipt_date) นับเฉพาะใบงานที่มีครบทั้งสองวันและวันรับเช็คไม่ก่อนวันเซ็นสัญญา — วิธีเดียวกับ computeDuration()',
  p_grain         => 'order',
  p_unit          => 'days',
  p_unit_decimals => 1,
  p_time_basis    => 'receipt_date',
  p_includes      => ARRAY['ใบงานที่มีทั้งวันเซ็นสัญญาและวันรับเช็ค'],
  p_excludes      => ARRAY['ใบงานที่ยังไม่รับเช็ค','ใบงานที่วันที่ผิดลำดับ'],
  p_synonyms      => ARRAY['ใช้เวลากี่วัน','ระยะเวลาเฉลี่ย','cycle time','งานเสร็จเร็วแค่ไหน'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       round(avg(o.receipt_date - o.contract_date)::numeric, 1) AS value,
       count(*)::bigint                                          AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id
  AND o.contract_date IS NOT NULL
  AND o.receipt_date IS NOT NULL
  AND o.receipt_date >= o.contract_date
  {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["company","customer_name"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"}]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => ARRAY['month','quarter','year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst']::text[],
  p_status        => 'draft'
);

-- #12 ลูกค้า (หน่วยงาน) อันดับต้น — DRAFT: ปัจจุบันมีหน่วยงานผู้ซื้อรายเดียว
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.top_customers_incl_vat',
  p_label_th      => 'หน่วยงานผู้ซื้ออันดับต้น (รวม VAT)',
  p_definition_th => 'จัดอันดับหน่วยงานผู้ซื้อ (customer_name) ตามผลรวมมูลค่ารวม VAT ในช่วงที่เลือก ยึดวันเริ่มงาน · ปัจจุบันข้อมูลจริงมีหน่วยงานผู้ซื้อเพียงรายเดียว ผลลัพธ์จึงยังไม่มีการจัดอันดับที่มีความหมาย',
  p_grain         => 'customer',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกขั้นตอนของงาน'],
  p_excludes      => ARRAY['ใบที่ยังไม่กรอกราคา (นับเป็น 0)'],
  p_synonyms      => ARRAY['ลูกค้ารายใหญ่','หน่วยงานไหนซื้อมากสุด','top customer','อันดับลูกค้า'],
  p_sql_template  => $tpl$
SELECT coalesce(o.customer_name, '(ไม่ระบุ)')     AS dimension,
       sum(coalesce(o.price_incl_vat,0))::numeric AS value,
       count(*)::bigint                            AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_default_view  => '{"chart_type":"bar","dimension":"customer_name","time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.top_customers_excl_vat',
  p_label_th      => 'หน่วยงานผู้ซื้ออันดับต้น (ก่อน VAT)',
  p_definition_th => 'จัดอันดับหน่วยงานผู้ซื้อ (customer_name) ตามผลรวมมูลค่าก่อน VAT ในช่วงที่เลือก ยึดวันเริ่มงาน · ปัจจุบันข้อมูลจริงมีหน่วยงานผู้ซื้อเพียงรายเดียว ผลลัพธ์จึงยังไม่มีการจัดอันดับที่มีความหมาย',
  p_grain         => 'customer',
  p_unit          => 'thb',
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกขั้นตอนของงาน'],
  p_excludes      => ARRAY['ภาษีมูลค่าเพิ่ม'],
  p_synonyms      => ARRAY['ลูกค้ารายใหญ่ก่อน VAT','อันดับหน่วยงานก่อนภาษี'],
  p_sql_template  => $tpl$
SELECT coalesce(o.customer_name, '(ไม่ระบุ)')     AS dimension,
       sum(coalesce(o.price_excl_vat,0))::numeric AS value,
       count(*)::bigint                            AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_default_view  => '{"chart_type":"bar","dimension":"customer_name","time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst','viewer']::text[],
  p_status        => 'draft'
);

-- ===========================================================================
-- D. gov_procure — กำไร / อัตรากำไร / คอมมิชชั่น / งานค้าง (owner-only ตาม D4)
--    ทั้งหมด DRAFT: ข้อมูลจริง net_profit_89 และ commission = 0 · milestone dates ว่าง
-- ===========================================================================

-- #8 กำไรที่รับรู้แล้ว
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.profit_realized',
  p_label_th      => 'กำไรที่รับรู้แล้ว',
  p_definition_th => 'ผลรวมกำไรสุทธิ (net_profit_89) ของใบงานที่รับเช็คแล้ว (ขั้นตอน paid หรือ closed) ยึดวันรับเช็ค — ตรงกับ profit_realized ใน computeSummary()',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => 'receipt_date',
  p_includes      => ARRAY['ใบงานขั้นตอน paid และ closed'],
  p_excludes      => ARRAY['ใบงานที่ยังไม่รับเช็ค','ใบที่ยังไม่กรอกกำไร (นับเป็น 0)'],
  p_synonyms      => ARRAY['กำไรที่ได้แล้ว','กำไรรับรู้','กำไรจริง','realized profit'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.net_profit_89,0))::numeric AS value,
       count(*)::bigint                           AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id AND o.stage IN ('paid','closed') {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["company","customer_name","department"]},"time_grain":{"type":"enum","values":["month","quarter","year","fiscal_year"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"}]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department","type":"text"}]'::jsonb,
  p_time_grains   => ARRAY['month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"line","dimension":null,"time_grain":"month","period":"this_year"}'::jsonb,
  p_chart_hint    => 'line',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- #9 กำไรค้างรับรู้
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.profit_pending',
  p_label_th      => 'กำไรค้างรับรู้',
  p_definition_th => 'ผลรวมกำไรสุทธิ (net_profit_89) ของใบงานที่ยังไม่รับเช็ค (ทุกขั้นตอนยกเว้น paid และ closed) — ตรงกับ profit_pending ใน computeSummary() · เป็นภาพ ณ ปัจจุบัน ไม่อิงช่วงเวลา',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => NULL,
  p_includes      => ARRAY['ใบงานทุกขั้นตอนที่ยังไม่ paid/closed'],
  p_excludes      => ARRAY['ใบงานที่รับเช็คแล้ว'],
  p_synonyms      => ARRAY['กำไรที่ยังไม่ได้','กำไรค้าง','กำไรรอรับรู้','pending profit'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.net_profit_89,0))::numeric AS value,
       count(*)::bigint                           AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id AND o.stage NOT IN ('paid','closed') {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"dimension":{"type":"enum","values":["stage","company","department"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage"},{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_comparisons   => ARRAY['none']::text[],
  p_default_view  => '{"chart_type":"bar","dimension":"stage","time_grain":null,"period":"snapshot"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- #10a อัตรากำไร (%) เทียบมูลค่ารวม VAT — ratio ของผลรวม ไม่ใช่ค่าเฉลี่ยรายแถว
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.profit_margin_pct_incl_vat',
  p_label_th      => 'อัตรากำไร % (ต่อมูลค่ารวม VAT)',
  p_definition_th => 'ผลรวมกำไรสุทธิ หารด้วย ผลรวมมูลค่ารวม VAT ของชุดข้อมูลเดียวกัน คูณ 100 — เป็นอัตราส่วนของผลรวม ไม่ใช่ค่าเฉลี่ยของเปอร์เซ็นต์รายใบ (การเฉลี่ยเปอร์เซ็นต์ให้ผลผิด) · คืน NULL เมื่อตัวหารเป็นศูนย์',
  p_grain         => 'order_set',
  p_unit          => 'percent',
  p_unit_decimals => 2,
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกใบงานที่ตรงเงื่อนไข'],
  p_excludes      => ARRAY['ใบที่ไม่มีมูลค่า (ทำให้ตัวหารเป็น 0)'],
  p_synonyms      => ARRAY['เปอร์เซ็นต์กำไร','margin','อัตรากำไร','กำไรกี่เปอร์เซ็นต์'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       CASE WHEN sum(coalesce(o.price_incl_vat,0)) = 0 THEN NULL
            ELSE round((sum(coalesce(o.net_profit_89,0)) / sum(coalesce(o.price_incl_vat,0))) * 100, 2)
       END::numeric                                AS value,
       sum(coalesce(o.net_profit_89,0))::numeric   AS profit_total,
       sum(coalesce(o.price_incl_vat,0))::numeric  AS base_total,
       count(*)::bigint                            AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["company","customer_name","stage"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"},{"key":"stage","label_th":"ขั้นตอน","column":"stage"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"}]'::jsonb,
  p_time_grains   => ARRAY['month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- #10b อัตรากำไร (%) เทียบมูลค่าก่อน VAT
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.profit_margin_pct_excl_vat',
  p_label_th      => 'อัตรากำไร % (ต่อมูลค่าก่อน VAT)',
  p_definition_th => 'ผลรวมกำไรสุทธิ หารด้วย ผลรวมมูลค่าก่อน VAT ของชุดข้อมูลเดียวกัน คูณ 100 — เป็นอัตราส่วนของผลรวม ไม่ใช่ค่าเฉลี่ยของเปอร์เซ็นต์รายใบ · คืน NULL เมื่อตัวหารเป็นศูนย์',
  p_grain         => 'order_set',
  p_unit          => 'percent',
  p_unit_decimals => 2,
  p_time_basis    => 'start_date',
  p_includes      => ARRAY['ทุกใบงานที่ตรงเงื่อนไข'],
  p_excludes      => ARRAY['ใบที่ไม่มีมูลค่า (ทำให้ตัวหารเป็น 0)'],
  p_synonyms      => ARRAY['เปอร์เซ็นต์กำไรก่อน VAT','margin ก่อนภาษี'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       CASE WHEN sum(coalesce(o.price_excl_vat,0)) = 0 THEN NULL
            ELSE round((sum(coalesce(o.net_profit_89,0)) / sum(coalesce(o.price_excl_vat,0))) * 100, 2)
       END::numeric                                AS value,
       sum(coalesce(o.net_profit_89,0))::numeric   AS profit_total,
       sum(coalesce(o.price_excl_vat,0))::numeric  AS base_total,
       count(*)::bigint                            AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"dimension":{"type":"enum","values":["company","customer_name","stage"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"customer_name","label_th":"หน่วยงานผู้ซื้อ","column":"customer_name"},{"key":"stage","label_th":"ขั้นตอน","column":"stage"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"}]'::jsonb,
  p_time_grains   => ARRAY['month','quarter','year','fiscal_year']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- #15 คอมมิชชั่นค้างจ่าย (D5-d: ยึด commission_payment_date IS NULL)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.commission_payable',
  p_label_th      => 'คอมมิชชั่นค้างจ่าย',
  p_definition_th => 'ผลรวมยอดคอมมิชชั่นสุทธิที่ต้องโอน (commission_net_payable) ของใบงานที่ยังไม่มีวันจ่ายคอม (commission_payment_date ว่าง) — ใช้คอลัมน์วันที่เป็นเกณฑ์ ไม่ใช้ช่องสถานะสลิปที่เป็นข้อความอิสระ · เป็นภาพ ณ ปัจจุบัน',
  p_grain         => 'order',
  p_unit          => 'thb',
  p_time_basis    => NULL,
  p_includes      => ARRAY['ใบงานที่มียอดคอมและยังไม่มีวันจ่าย'],
  p_excludes      => ARRAY['ใบงานที่จ่ายคอมแล้ว','ใบงานที่ยอดคอมเป็นศูนย์หรือว่าง'],
  p_synonyms      => ARRAY['คอมค้างจ่าย','ค้างจ่ายคอม','commission','ยังไม่จ่ายคอม'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       sum(coalesce(o.commission_net_payable,0))::numeric AS value,
       count(*)::bigint                                    AS order_count
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id
  AND o.commission_payment_date IS NULL
  AND coalesce(o.commission_net_payable,0) <> 0
  {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"dimension":{"type":"enum","values":["company","stage"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"stage","label_th":"ขั้นตอน","column":"stage"}]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"},{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_comparisons   => ARRAY['none']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"snapshot"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- #17 งานค้างเกินกำหนด (D5-c: aging จาก milestone ล่าสุดที่มีค่า ไม่ใช้ updated_at)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.stuck_orders',
  p_label_th      => 'งานค้างเกินกำหนด',
  p_definition_th => 'จำนวนและมูลค่าของใบงานที่ยังไม่ปิด (ไม่ใช่ paid/closed) และไม่มีความเคลื่อนไหวเกินเกณฑ์วันที่ตั้งไว้ (gov_procure_settings.sla_threshold ค่าเริ่มต้น 30 วัน) โดยนับจากวันที่หมุดล่าสุดที่มีค่า เรียงจากวันส่งมอบ วันสั่งซื้อ วันเซ็นสัญญา และวันเริ่มงาน ตามลำดับ · ระบบยังไม่เก็บวันที่เปลี่ยนขั้นตอน จึงเป็นการประมาณจากหมุดที่มี',
  p_grain         => 'order',
  p_unit          => 'count',
  p_unit_decimals => 0,
  p_time_basis    => NULL,
  p_includes      => ARRAY['ใบงานที่ยังไม่ paid/closed และมีวันที่หมุดอย่างน้อยหนึ่งช่อง'],
  p_excludes      => ARRAY['ใบงานที่ปิดแล้ว','ใบงานที่ไม่มีวันที่หมุดใดเลย'],
  p_synonyms      => ARRAY['งานค้าง','งานนิ่ง','งานไม่ขยับ','ค้างนาน','stuck'],
  p_sql_template  => $tpl$
SELECT {{dim_select}}
       count(*)::bigint                            AS value,
       sum(coalesce(o.price_incl_vat,0))::numeric  AS pipeline_value_incl_vat,
       max(CURRENT_DATE - coalesce(o.delivery_date, o.payment_order_date, o.contract_date, o.start_date))::int AS max_idle_days
FROM gov_procure_orders o, __p
WHERE o.org_id = __p.org_id
  AND o.stage NOT IN ('paid','closed')
  AND (CURRENT_DATE - coalesce(o.delivery_date, o.payment_order_date, o.contract_date, o.start_date)) >
      coalesce((SELECT s.sla_threshold FROM gov_procure_settings s WHERE s.org_id = __p.org_id), 30)
  {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"dimension":{"type":"enum","values":["stage","company","department"]},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage"},{"key":"company","label_th":"บริษัทรับงาน","column":"company"},{"key":"department","label_th":"หน่วยงาน/กอง","column":"department"}]'::jsonb,
  p_filters       => '[{"key":"stage","label_th":"ขั้นตอน","column":"stage","type":"text_list"},{"key":"company","label_th":"บริษัทรับงาน","column":"company","type":"text_list"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_comparisons   => ARRAY['none']::text[],
  p_default_view  => '{"chart_type":"bar","dimension":"stage","time_grain":null,"period":"snapshot"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner','analyst']::text[],
  p_status        => 'draft'
);

-- ===========================================================================
-- E. gov_procure — กองทุน / นักลงทุน (D3 + D4: owner-only ทั้งหมด
--    · มิติที่เป็นบุคคล ติด no_summarize=true ตาม §5 data boundary)
-- ===========================================================================

-- การเคลื่อนไหวเงินทุนแยกตามชนิดรายการ — VERIFIED (นับตรงจาก ledger)
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.capital_flow_by_type',
  p_label_th      => 'การเคลื่อนไหวเงินทุนแยกตามชนิดรายการ',
  p_definition_th => 'ผลรวมจำนวนเงินในสมุด gov_procure_capital_flows แยกตามชนิดรายการ (ลงขัน กระจายทุน คืนทุนเข้ากองกลาง ปันผล คืนเงินต้น) ตามช่วงวันที่ของรายการ (flow_date) — เป็นยอดดิบของแต่ละชนิด ยังไม่คิดทิศทางเข้า-ออก',
  p_grain         => 'capital_flow',
  p_unit          => 'thb',
  p_time_basis    => 'flow_date',
  p_includes      => ARRAY['ทุกรายการในสมุดเงินทุนของหน่วยงานนี้'],
  p_excludes      => ARRAY['กำไรของบริษัทที่คำนวณจากใบงาน (ไม่ได้เก็บในสมุดนี้)'],
  p_synonyms      => ARRAY['เงินทุน','กองทุน','การเคลื่อนไหวเงินทุน','ลงขัน','ปันผล','คืนทุน','capital flow'],
  p_sql_template  => $tpl$
SELECT o.flow_type              AS dimension,
       sum(o.amount)::numeric   AS value,
       count(*)::bigint         AS flow_count
FROM gov_procure_capital_flows o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"flow_type","label_th":"ชนิดรายการ","column":"flow_type","type":"text_list"},{"key":"company","label_th":"บริษัท","column":"company","type":"text_list"},{"key":"flow_date","label_th":"ช่วงวันที่รายการ","column":"flow_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],   -- N3: มิติถูกกำหนดตายตัวใน template (ไม่มี {{dim_select}}) → ห้ามรับ time_grain
  p_default_view  => '{"chart_type":"bar","dimension":"flow_type","time_grain":null,"period":"this_year"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- เงินลงขันสะสมต่อนักลงทุน — VERIFIED · มิติเป็นบุคคล → no_summarize
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.capital_contribution',
  p_label_th      => 'เงินลงขันต่อนักลงทุน',
  p_definition_th => 'ผลรวมเงินที่นักลงทุนแต่ละรายลงขันเข้ากองกลาง (รายการชนิด contribution) ตามช่วงวันที่ของรายการ · ข้อมูลรายบุคคล จะไม่ถูกส่งให้ AI สรุปเป็นข้อความ',
  p_grain         => 'investor',
  p_unit          => 'thb',
  p_time_basis    => 'flow_date',
  p_includes      => ARRAY['รายการชนิด contribution เท่านั้น'],
  p_excludes      => ARRAY['รายการชนิดอื่นทั้งหมด'],
  p_synonyms      => ARRAY['เงินลงขัน','ใครลงทุนเท่าไร','เงินลงทุนนักลงทุน','contribution'],
  p_sql_template  => $tpl$
SELECT coalesce(i.name, '(ไม่ระบุ)')  AS dimension,
       sum(o.amount)::numeric          AS value,
       count(*)::bigint                AS flow_count
FROM gov_procure_capital_flows o
LEFT JOIN gov_procure_investors i ON i.id = o.investor_id AND i.org_id = o.org_id, __p
WHERE o.org_id = __p.org_id AND o.flow_type = 'contribution' {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"flow_date","label_th":"ช่วงวันที่รายการ","column":"flow_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],   -- N3: มิติถูกกำหนดตายตัวใน template (ไม่มี {{dim_select}}) → ห้ามรับ time_grain
  p_default_view  => '{"chart_type":"bar","dimension":"investor","time_grain":null,"period":"all"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_no_summarize  => true,
  p_status        => 'draft'
);

-- ทุนที่กระจายไปแต่ละบริษัท — VERIFIED
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.capital_allocated',
  p_label_th      => 'ทุนที่กระจายไปแต่ละบริษัท',
  p_definition_th => 'ผลรวมเงินที่กระจายจากกองกลางไปยังบริษัทรับงาน (รายการชนิด allocation) แยกตามบริษัท ตามช่วงวันที่ของรายการ',
  p_grain         => 'company',
  p_unit          => 'thb',
  p_time_basis    => 'flow_date',
  p_includes      => ARRAY['รายการชนิด allocation เท่านั้น'],
  p_excludes      => ARRAY['รายการชนิดอื่นทั้งหมด'],
  p_synonyms      => ARRAY['กระจายทุน','ทุนที่ให้บริษัท','allocation','โอนทุนให้บริษัท'],
  p_sql_template  => $tpl$
SELECT coalesce(o.company, '(ไม่ระบุ)') AS dimension,
       sum(o.amount)::numeric            AS value,
       count(*)::bigint                  AS flow_count
FROM gov_procure_capital_flows o, __p
WHERE o.org_id = __p.org_id AND o.flow_type = 'allocation' {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัท","column":"company","type":"text_list"},{"key":"flow_date","label_th":"ช่วงวันที่รายการ","column":"flow_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],   -- N3: มิติถูกกำหนดตายตัวใน template (ไม่มี {{dim_select}}) → ห้ามรับ time_grain
  p_default_view  => '{"chart_type":"bar","dimension":"company","time_grain":null,"period":"all"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- #19 ปันผลจ่ายต่อนักลงทุน — VERIFIED · no_summarize
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.investor_dividend',
  p_label_th      => 'ปันผลจ่ายต่อนักลงทุน',
  p_definition_th => 'ผลรวมเงินปันผลที่จ่ายให้นักลงทุนแต่ละราย (รายการชนิด dividend) ตามช่วงวันที่ของรายการ · ข้อมูลรายบุคคล จะไม่ถูกส่งให้ AI สรุปเป็นข้อความ',
  p_grain         => 'investor',
  p_unit          => 'thb',
  p_time_basis    => 'flow_date',
  p_includes      => ARRAY['รายการชนิด dividend เท่านั้น'],
  p_excludes      => ARRAY['การคืนเงินต้น (repayment)'],
  p_synonyms      => ARRAY['ปันผล','จ่ายปันผล','dividend','นักลงทุนได้เท่าไร'],
  p_sql_template  => $tpl$
SELECT coalesce(i.name, '(ไม่ระบุ)')  AS dimension,
       sum(o.amount)::numeric          AS value,
       count(*)::bigint                AS flow_count
FROM gov_procure_capital_flows o
LEFT JOIN gov_procure_investors i ON i.id = o.investor_id AND i.org_id = o.org_id, __p
WHERE o.org_id = __p.org_id AND o.flow_type = 'dividend' {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทผู้จ่าย","column":"company","type":"text_list"},{"key":"flow_date","label_th":"ช่วงวันที่รายการ","column":"flow_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],   -- N3: มิติถูกกำหนดตายตัวใน template (ไม่มี {{dim_select}}) → ห้ามรับ time_grain
  p_default_view  => '{"chart_type":"bar","dimension":"investor","time_grain":null,"period":"all"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_no_summarize  => true,
  p_status        => 'draft'
);

-- คืนเงินต้นต่อนักลงทุน — VERIFIED · no_summarize
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.investor_repayment',
  p_label_th      => 'คืนเงินต้นต่อนักลงทุน',
  p_definition_th => 'ผลรวมเงินต้นที่คืนให้นักลงทุนแต่ละราย (รายการชนิด repayment) ตามช่วงวันที่ของรายการ · ข้อมูลรายบุคคล จะไม่ถูกส่งให้ AI สรุปเป็นข้อความ',
  p_grain         => 'investor',
  p_unit          => 'thb',
  p_time_basis    => 'flow_date',
  p_includes      => ARRAY['รายการชนิด repayment เท่านั้น'],
  p_excludes      => ARRAY['เงินปันผล (dividend)'],
  p_synonyms      => ARRAY['คืนเงินต้น','คืนทุนนักลงทุน','repayment'],
  p_sql_template  => $tpl$
SELECT coalesce(i.name, '(ไม่ระบุ)')  AS dimension,
       sum(o.amount)::numeric          AS value,
       count(*)::bigint                AS flow_count
FROM gov_procure_capital_flows o
LEFT JOIN gov_procure_investors i ON i.id = o.investor_id AND i.org_id = o.org_id, __p
WHERE o.org_id = __p.org_id AND o.flow_type = 'repayment' {{time_filter}} {{filters}}
GROUP BY 1
ORDER BY 2 DESC NULLS LAST
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัทผู้จ่าย","column":"company","type":"text_list"},{"key":"flow_date","label_th":"ช่วงวันที่รายการ","column":"flow_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],   -- N3: มิติถูกกำหนดตายตัวใน template (ไม่มี {{dim_select}}) → ห้ามรับ time_grain
  p_default_view  => '{"chart_type":"bar","dimension":"investor","time_grain":null,"period":"all"}'::jsonb,
  p_chart_hint    => 'bar',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_no_summarize  => true,
  p_status        => 'draft'
);

-- #18 ยอดกองทุนคงเหลือ — DRAFT: ทิศทางเงินของแต่ละชนิดรายการยังต้องให้เจ้าของยืนยัน
SELECT public._bi_seed_metric(
  p_key           => 'gov_procure.capital_pool_balance',
  p_label_th      => 'ยอดกองทุนคงเหลือ',
  p_definition_th => 'ยอดคงเหลือของกองกลาง คำนวณเป็น เงินลงขัน บวก เงินคืนเข้ากองกลาง ลบ ทุนที่กระจายไปบริษัท ลบ ปันผล ลบ เงินต้นที่คืนนักลงทุน · ทิศทางเข้า-ออกของแต่ละชนิดรายการยังรอเจ้าของธุรกิจยืนยัน metric นี้จึงยังเป็นสถานะร่าง',
  p_grain         => 'org',
  p_unit          => 'thb',
  p_time_basis    => 'flow_date',
  p_includes      => ARRAY['ทุกรายการในสมุดเงินทุนของหน่วยงานนี้'],
  p_excludes      => ARRAY['กำไรของบริษัทที่ยังไม่ถูกบันทึกเป็นรายการเงินทุน'],
  p_synonyms      => ARRAY['กองทุนเหลือเท่าไร','เงินกองกลาง','ยอดกองทุน','pool balance'],
  p_sql_template  => $tpl$
SELECT NULL::text AS dimension,
       sum(CASE o.flow_type
             WHEN 'contribution'   THEN o.amount
             WHEN 'return_to_pool' THEN o.amount
             WHEN 'allocation'     THEN -o.amount
             WHEN 'dividend'       THEN -o.amount
             WHEN 'repayment'      THEN -o.amount
             ELSE 0
           END)::numeric AS value,
       count(*)::bigint  AS flow_count
FROM gov_procure_capital_flows o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
$tpl$,
  p_param_schema  => '{"date_from":{"type":"date"},"date_to":{"type":"date"},"filters":{"type":"object"},"limit":{"type":"int","max":1000}}'::jsonb,
  p_dimensions    => '[]'::jsonb,
  p_filters       => '[{"key":"company","label_th":"บริษัท","column":"company","type":"text_list"},{"key":"flow_date","label_th":"ช่วงวันที่รายการ","column":"flow_date","type":"date_range"}]'::jsonb,
  p_time_grains   => '{}'::text[],
  p_comparisons   => ARRAY['none']::text[],
  p_default_view  => '{"chart_type":"stat","dimension":null,"time_grain":null,"period":"all"}'::jsonb,
  p_chart_hint    => 'stat',
  p_module_scope  => 'gov_procure',
  p_allowed_roles => ARRAY['owner']::text[],
  p_status        => 'draft'
);

-- ---------------------------------------------------------------------------
-- เก็บกวาด helper (ไม่ทิ้งฟังก์ชันค้างไว้ใน public)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._bi_seed_metric(
  text, text, text, text, text, text, text, text[], text, text, text, int,
  text[], text[], text[], jsonb, jsonb, text[], text[], jsonb, jsonb, text, boolean, int
);
