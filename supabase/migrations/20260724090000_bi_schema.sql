-- ============================================================================
-- bi — BI Chat (ถามข้อมูลธุรกิจด้วย AI) · Phase 1 schema
-- Contract: .claude/module-factory/specs/bi.md §6.1 (ตาราง) §6.2 (enum) §6.3 (RPC)
-- Decisions: §11 D1–D5 (locked 2026-07-24)
--
-- กฎที่ยึด (CONTEXT §7):
--   - ทุกตารางที่มีข้อมูลราย org: org_id NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
--   - ENABLE ROW LEVEL SECURITY ทุกตาราง · SELECT = is_org_member(org_id, auth.uid())
--     · write = is_org_admin(org_id, auth.uid()) (สิทธิ์เขียนจริงคุมที่ API ด้วย canModuleWrite)
--   - bi_metrics + bi_usage_daily = ตารางกลาง/ระบบ → RLS deny-all (ไม่มี policy) ท่าเดียวกับ kb_chunks
--   - RPC SECURITY DEFINER: SET search_path = public + REVOKE ALL FROM PUBLIC, anon, authenticated
--     + GRANT EXECUTE TO service_role
--   - trigger updated_at ใช้ public.set_updated_at() (มีจริงในรีโป — O3)
--   - ไม่แตะ/ไม่ ALTER ตารางของ gov_procure (อ่านอย่างเดียวผ่าน sql_template)
--
-- ⚠️ กฎถาวรของ bi_metrics (security-reviewer N2 — ห้ามละเมิดแม้ในเฟสถัดไป):
--   `bi_metrics.sql_template` ถูกรันโดย run_bi_metric ซึ่งเป็น SECURITY DEFINER
--   → "สิทธิ์เขียน bi_metrics" = "สิทธิ์อ่านทั้งฐานข้อมูลโดยพฤตินัย"
--   ดังนั้น **สิทธิ์เขียนต้องเป็น service-role / super_admin เท่านั้นตลอดไป**
--   ห้ามผูกสิทธิ์เขียนกับ role ระดับ org (owner/analyst) แม้ตอนทำหน้า admin จัดการ metric ใน Phase 4
--   (หน้า admin ต้องเรียกผ่าน API ที่ requireAdmin = super_admin เท่านั้น)
--
-- ⚠️ ตารางที่เก็บข้อมูลของผู้ใช้ (threads/messages/query_log/dashboards) ถูก REVOKE
--   จาก anon+authenticated ท้ายไฟล์ → เข้าถึงได้ทางเดียวคือ service-role ผ่าน requireBiMember
--   (RLS ที่เหลือไว้เป็นชั้นสอง เผื่อมีการ GRANT กลับโดยไม่ตั้งใจ)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ===========================================================================
-- 1) bi_metrics — semantic layer (ตารางกลาง ไม่มี org_id · O1)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bi_metrics (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text        NOT NULL UNIQUE,
  label_th          text        NOT NULL,
  definition_th     text        NOT NULL,
  includes          text[]      NOT NULL DEFAULT '{}',
  excludes          text[]      NOT NULL DEFAULT '{}',
  grain             text        NOT NULL,
  time_basis        text,                                   -- ชื่อคอลัมน์วันที่จริง · NULL = snapshot
  unit              text        NOT NULL,
  unit_decimals     int         NOT NULL DEFAULT 2,
  synonyms          text[]      NOT NULL DEFAULT '{}',
  sql_template      text        NOT NULL,
  param_schema      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dimensions        jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{key,label_th,column}]
  time_grains       text[]      NOT NULL DEFAULT '{}',
  comparisons       text[]      NOT NULL DEFAULT '{}',
  filters           jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{key,label_th,column,type}]
  default_view      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  chart_hint        text,
  module_scope      text        NOT NULL,
  allowed_roles     text[]      NOT NULL,
  owner_label       text,
  status            text        NOT NULL DEFAULT 'draft',
  no_summarize      boolean     NOT NULL DEFAULT false,
  max_period_months int         NOT NULL DEFAULT 36,
  embedding         vector(768),
  verified_at       timestamptz,
  verified_by       uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bi_metrics_status_chk
    CHECK (status IN ('draft','verified','deprecated')),
  CONSTRAINT bi_metrics_unit_chk
    CHECK (unit IN ('thb','count','days','percent')),
  CONSTRAINT bi_metrics_module_scope_chk
    CHECK (module_scope IN ('gov_procure','accounting','core')),
  CONSTRAINT bi_metrics_chart_hint_chk
    CHECK (chart_hint IS NULL OR chart_hint IN
      ('stat','line','bar','donut','funnel','table','stacked_bar','heatmap')),
  CONSTRAINT bi_metrics_time_grains_chk
    CHECK (time_grains <@ ARRAY['day','week','month','quarter','fiscal_year','year']::text[]),
  CONSTRAINT bi_metrics_comparisons_chk
    CHECK (comparisons <@ ARRAY['none','prev_period','yoy','target']::text[]),
  CONSTRAINT bi_metrics_allowed_roles_chk
    CHECK (allowed_roles <@ ARRAY['owner','analyst','viewer']::text[] AND array_length(allowed_roles,1) >= 1),
  CONSTRAINT bi_metrics_max_period_chk
    CHECK (max_period_months BETWEEN 1 AND 120),
  -- SELECT-only + ต้อง bind org_id เสมอ (กันคนเผลอ seed template ที่ไม่มี tenant filter)
  CONSTRAINT bi_metrics_template_selectonly_chk
    CHECK (position(';' IN sql_template) = 0 AND sql_template ~* '\mselect\M'
           AND sql_template !~* '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|vacuum|call)\M'),
  -- ต้องมีเงื่อนไข tenant จริง ๆ (o.org_id = __p.org_id) ไม่ใช่แค่ปรากฏสตริง __p.org_id ที่ไหนก็ได้
  CONSTRAINT bi_metrics_template_org_bind_chk
    CHECK (sql_template ~ 'o\.org_id[[:space:]]*=[[:space:]]*__p\.org_id')
);

CREATE INDEX IF NOT EXISTS bi_metrics_key_idx    ON public.bi_metrics (key);
CREATE INDEX IF NOT EXISTS bi_metrics_scope_idx  ON public.bi_metrics (module_scope, status);
CREATE INDEX IF NOT EXISTS bi_metrics_status_idx ON public.bi_metrics (status);
CREATE INDEX IF NOT EXISTS bi_metrics_embedding_idx
  ON public.bi_metrics USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.bi_metrics ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy → deny-all · เข้าถึงผ่าน service role / RPC SECURITY DEFINER เท่านั้น

DROP TRIGGER IF EXISTS trg_bi_metrics_updated ON public.bi_metrics;
CREATE TRIGGER trg_bi_metrics_updated
  BEFORE UPDATE ON public.bi_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 2) bi_threads — บทสนทนา (ต่อ org ต่อผู้ใช้)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bi_threads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES public.profiles(id),
  title           text,
  last_message_at timestamptz,
  -- D1: จำ preference incl/excl VAT ที่ผู้ใช้เลือกไว้ใน thread นี้
  preferences     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bi_threads_org_idx      ON public.bi_threads (org_id);
CREATE INDEX IF NOT EXISTS bi_threads_org_user_idx ON public.bi_threads (org_id, created_by);
CREATE INDEX IF NOT EXISTS bi_threads_recent_idx   ON public.bi_threads (org_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS bi_threads_created_idx  ON public.bi_threads (created_at DESC);

ALTER TABLE public.bi_threads ENABLE ROW LEVEL SECURITY;

-- S1: บทสนทนาเป็นของ "คน" ไม่ใช่ของ org — สมาชิก org คนอื่นต้องไม่เห็นคำถาม/คำตอบของกันและกัน
DROP POLICY IF EXISTS bi_threads_select ON public.bi_threads;
CREATE POLICY bi_threads_select ON public.bi_threads
  FOR SELECT USING (created_by = auth.uid() AND public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS bi_threads_write ON public.bi_threads;
CREATE POLICY bi_threads_write ON public.bi_threads
  FOR ALL USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_bi_threads_updated ON public.bi_threads;
CREATE TRIGGER trg_bi_threads_updated
  BEFORE UPDATE ON public.bi_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 3) bi_messages — ข้อความในบทสนทนา (user/assistant)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bi_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id        uuid        NOT NULL REFERENCES public.bi_threads(id) ON DELETE CASCADE,
  role             text        NOT NULL,
  content          text        NOT NULL,
  metric_key       text,
  params           jsonb,
  chart_spec       jsonb,
  result_rows      jsonb,
  result_row_count int,
  source           text        NOT NULL DEFAULT 'web',
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bi_messages_role_chk   CHECK (role IN ('user','assistant')),
  CONSTRAINT bi_messages_source_chk CHECK (source IN ('web','line'))
);

CREATE INDEX IF NOT EXISTS bi_messages_org_idx      ON public.bi_messages (org_id);
CREATE INDEX IF NOT EXISTS bi_messages_thread_idx   ON public.bi_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS bi_messages_created_idx  ON public.bi_messages (created_at DESC);

ALTER TABLE public.bi_messages ENABLE ROW LEVEL SECURITY;

-- S1: ผลลัพธ์ metric (รวม owner-only) นอนอยู่ใน result_rows → จำกัดที่เจ้าของ thread เท่านั้น
DROP POLICY IF EXISTS bi_messages_select ON public.bi_messages;
CREATE POLICY bi_messages_select ON public.bi_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.bi_threads t
     WHERE t.id = thread_id
       AND t.created_by = auth.uid()
       AND public.is_org_member(t.org_id, auth.uid())
  ));

DROP POLICY IF EXISTS bi_messages_write ON public.bi_messages;
CREATE POLICY bi_messages_write ON public.bi_messages
  FOR ALL USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

-- S1(3): metric ที่ no_summarize=true = ข้อมูลรายแถว/รายบุคคล → ห้ามเก็บ result_rows ค้างใน DB
-- สัญญาฝั่ง API: อย่าส่ง result_rows มาเลยสำหรับ metric กลุ่มนี้ (ส่งตรงเข้า <Table> ฝั่ง client)
-- ชั้น DB บังคับซ้ำด้วย trigger — เก็บเฉพาะ result_row_count
CREATE OR REPLACE FUNCTION public.fn_bi_strip_sensitive_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.result_rows IS NOT NULL AND NEW.metric_key IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.bi_metrics m
                  WHERE m.key = NEW.metric_key AND m.no_summarize) THEN
    NEW.result_rows := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bi_messages_strip_rows ON public.bi_messages;
CREATE TRIGGER trg_bi_messages_strip_rows
  BEFORE INSERT OR UPDATE ON public.bi_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_bi_strip_sensitive_rows();

-- ===========================================================================
-- 4) bi_dashboards / 5) bi_dashboard_items — ปักหมุดคำตอบ (ตารางพร้อม, หน้า/API = Phase 3)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bi_dashboards (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_by uuid        NOT NULL REFERENCES public.profiles(id),
  layout     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bi_dashboards_org_idx     ON public.bi_dashboards (org_id);
CREATE INDEX IF NOT EXISTS bi_dashboards_created_idx ON public.bi_dashboards (created_at DESC);

ALTER TABLE public.bi_dashboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bi_dashboards_select ON public.bi_dashboards;
CREATE POLICY bi_dashboards_select ON public.bi_dashboards
  FOR SELECT USING (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS bi_dashboards_write ON public.bi_dashboards;
CREATE POLICY bi_dashboards_write ON public.bi_dashboards
  FOR ALL USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_bi_dashboards_updated ON public.bi_dashboards;
CREATE TRIGGER trg_bi_dashboards_updated
  BEFORE UPDATE ON public.bi_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.bi_dashboard_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dashboard_id uuid        NOT NULL REFERENCES public.bi_dashboards(id) ON DELETE CASCADE,
  title        text,
  metric_key   text        NOT NULL,
  params       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  chart_type   text,
  position     int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bi_dashboard_items_chart_type_chk
    CHECK (chart_type IS NULL OR chart_type IN
      ('stat','line','bar','donut','funnel','table','stacked_bar','heatmap'))
);

CREATE INDEX IF NOT EXISTS bi_dashboard_items_org_idx       ON public.bi_dashboard_items (org_id);
CREATE INDEX IF NOT EXISTS bi_dashboard_items_dashboard_idx ON public.bi_dashboard_items (dashboard_id, position);
CREATE INDEX IF NOT EXISTS bi_dashboard_items_created_idx   ON public.bi_dashboard_items (created_at DESC);

ALTER TABLE public.bi_dashboard_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bi_dashboard_items_select ON public.bi_dashboard_items;
CREATE POLICY bi_dashboard_items_select ON public.bi_dashboard_items
  FOR SELECT USING (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS bi_dashboard_items_write ON public.bi_dashboard_items;
CREATE POLICY bi_dashboard_items_write ON public.bi_dashboard_items
  FOR ALL USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

-- ===========================================================================
-- 6) bi_query_log — audit ทุกคำถาม + ต้นทุน token
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bi_query_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id          uuid REFERENCES public.profiles(id),
  thread_id           uuid,
  message_id          uuid,
  source              text        NOT NULL,
  question            text        NOT NULL,
  matched_metric_key  text,
  match_score         numeric(6,4),
  params              jsonb,
  answer_status       text        NOT NULL,
  result_row_count    int,
  latency_ms          int,
  sql_ms              int,
  model               text,
  token_in            int,
  token_out           int,
  cost_usd            numeric(12,6),
  feedback            text,
  feedback_note       text,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bi_query_log_source_chk   CHECK (source IN ('web','line')),
  CONSTRAINT bi_query_log_status_chk
    CHECK (answer_status IN ('answered','clarify','no_match','refused','error')),
  CONSTRAINT bi_query_log_feedback_chk CHECK (feedback IS NULL OR feedback IN ('up','down'))
);

CREATE INDEX IF NOT EXISTS bi_query_log_org_idx     ON public.bi_query_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bi_query_log_created_idx ON public.bi_query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS bi_query_log_metric_idx  ON public.bi_query_log (matched_metric_key);
CREATE INDEX IF NOT EXISTS bi_query_log_status_idx  ON public.bi_query_log (org_id, answer_status);
CREATE INDEX IF NOT EXISTS bi_query_log_thread_idx  ON public.bi_query_log (thread_id);

ALTER TABLE public.bi_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bi_query_log_select ON public.bi_query_log;
CREATE POLICY bi_query_log_select ON public.bi_query_log
  FOR SELECT USING (public.is_org_member(org_id, auth.uid()));

-- S3: audit log ห้ามแก้/ลบจากฝั่ง client (org admin ลบร่องรอยการดึงข้อมูลอ่อนไหวได้)
-- → ไม่มี policy สำหรับ INSERT/UPDATE/DELETE เลย = deny-all · เขียนผ่าน service-role เท่านั้น
-- (ท่าเดียวกับ issue_report_usage / acc_doc_sequences)
DROP POLICY IF EXISTS bi_query_log_write ON public.bi_query_log;

-- ===========================================================================
-- 7) bi_usage_daily — rate limit ต่อคน/วัน (deny-all, ท่า flow_chat_usage)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.bi_usage_daily (
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day        date        NOT NULL DEFAULT CURRENT_DATE,
  count      int         NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, profile_id, day)
);

CREATE INDEX IF NOT EXISTS bi_usage_daily_org_day_idx ON public.bi_usage_daily (org_id, day);

ALTER TABLE public.bi_usage_daily ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy → deny-all · service role เท่านั้น

-- ===========================================================================
-- 8) RPC run_bi_metric — รัน metric template แบบ parameterized (§6.3)
--    ความปลอดภัยที่บังคับในตัวฟังก์ชัน:
--      · ค่าที่ผู้ใช้ส่งมา "ไม่เคย" ถูกต่อเป็นสตริง SQL — ผ่าน $1..$5 (USING) เท่านั้น
--      · ชื่อคอลัมน์มาจาก allowlist ใน bi_metrics.dimensions/filters/time_basis + quote_ident (%I)
--      · key ที่ไม่อยู่ใน allowlist = RAISE EXCEPTION (ไม่มี fallback เงียบ)
--      · org_id bind ทุก template ผ่าน CTE __p (ตรวจว่า template มี o.org_id = __p.org_id จริงก่อนรัน)
--      · SELECT-only (regex + transaction_read_only) · statement_timeout 10s · LIMIT บังคับ
--      · เพดานช่วงเวลาจาก bi_metrics.max_period_months (เกิน → หด date_from ให้อัตโนมัติ)
--      · RBAC ระดับ metric (S2): p_role ต้องอยู่ใน allowed_roles — runner เป็นด่านสุดท้าย
--        เพราะ metric_key ไม่ได้มาจาก retrieval อย่างเดียว (thread history / dashboard item / payload)
--      · ตอบได้เฉพาะ status='verified' — draft/deprecated = RAISE (§3.1 ข้อ 4 "ไม่มั่นใจ = ไม่ตอบ")
--        ยกเว้น p_allow_draft=true ซึ่งสงวนไว้ให้ golden test / สคริปต์ตรวจเลขเท่านั้น
--
--    สัญญาของ sql_template (ที่ seed ต้องทำตาม):
--      · ห้ามมี ';' · ห้ามขึ้นต้นด้วย WITH (runner ใส่ CTE __p ให้เอง)
--      · ตารางข้อเท็จจริงหลัก alias ว่า `o` และ cross join `__p` แล้ว WHERE o.org_id = __p.org_id
--      · placeholder ที่รองรับ: {{dim_select}} (คอลัมน์แรกของ SELECT), {{group_by}},
--        {{time_filter}}, {{filters}}
-- ===========================================================================
DROP FUNCTION IF EXISTS public.run_bi_metric(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.run_bi_metric(
  p_org_id     uuid,
  p_metric_key text,
  p_params     jsonb,
  p_role       text,
  p_allow_draft boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m               public.bi_metrics%ROWTYPE;
  v_tpl           text;
  v_sql           text;
  v_final         text;
  v_dim_key       text;
  v_dim_col       text;
  v_dim_select    text := 'NULL::text AS dimension,';
  v_group_by      text := '';
  v_time_filter   text := '';
  v_filters       text := '';
  v_grain         text;
  v_from          date;
  v_to            date;
  v_limit         int;
  v_max_months    int;
  v_filter_vals   jsonb;
  v_rows          jsonb;
  v_start         timestamptz := clock_timestamp();
  v_key           text;
  v_val           jsonb;
  v_col           text;
  v_type          text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'run_bi_metric: ต้องระบุ org_id (bind จาก session ฝั่งเซิร์ฟเวอร์เท่านั้น)';
  END IF;
  p_params := COALESCE(p_params, '{}'::jsonb);
  IF jsonb_typeof(p_params) <> 'object' THEN
    RAISE EXCEPTION 'run_bi_metric: params ต้องเป็น object';
  END IF;

  IF p_role IS NULL OR btrim(p_role) = '' THEN
    RAISE EXCEPTION 'run_bi_metric: ต้องระบุ role ของผู้ถาม (มาจาก module_members ฝั่งเซิร์ฟเวอร์)';
  END IF;

  SELECT * INTO m FROM public.bi_metrics WHERE key = p_metric_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_bi_metric: ไม่รู้จัก metric %', p_metric_key;
  END IF;

  -- S2: RBAC ระดับ metric — ด่านสุดท้ายที่ runner (ไม่ใช่แค่ตอน retrieval)
  IF NOT (p_role = ANY (m.allowed_roles)) THEN
    RAISE EXCEPTION 'run_bi_metric: role % ไม่มีสิทธิ์ดู metric %', p_role, p_metric_key;
  END IF;

  IF m.status = 'deprecated' THEN
    RAISE EXCEPTION 'run_bi_metric: metric % ถูกยกเลิกแล้ว', p_metric_key;
  END IF;
  IF m.status <> 'verified' AND NOT COALESCE(p_allow_draft, false) THEN
    RAISE EXCEPTION 'run_bi_metric: metric % ยังไม่มีนิยามที่ยืนยัน (status=%)', p_metric_key, m.status;
  END IF;

  -- ---- ตรวจ template (defense in depth ซ้ำกับ CHECK constraint) ----
  v_tpl := m.sql_template;
  IF v_tpl IS NULL OR btrim(v_tpl) = '' THEN
    RAISE EXCEPTION 'run_bi_metric: metric % ไม่มี sql_template', p_metric_key;
  END IF;
  IF position(';' IN v_tpl) > 0 THEN
    RAISE EXCEPTION 'run_bi_metric: sql_template ของ % มี ";"', p_metric_key;
  END IF;
  IF v_tpl !~* '\mselect\M'
     OR v_tpl ~* '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|vacuum|call)\M' THEN
    RAISE EXCEPTION 'run_bi_metric: sql_template ของ % ต้องเป็น SELECT อย่างเดียว', p_metric_key;
  END IF;
  IF v_tpl !~ 'o\.org_id[[:space:]]*=[[:space:]]*__p\.org_id' THEN
    RAISE EXCEPTION 'run_bi_metric: sql_template ของ % ไม่ได้ bind o.org_id = __p.org_id', p_metric_key;
  END IF;
  IF btrim(v_tpl) ~* '^with\M' THEN
    RAISE EXCEPTION 'run_bi_metric: sql_template ห้ามขึ้นต้นด้วย WITH (runner ใส่ CTE __p ให้เอง)';
  END IF;

  -- ---- ช่วงเวลา + เพดาน max_period_months ----
  v_from := NULLIF(p_params->>'date_from','')::date;
  v_to   := NULLIF(p_params->>'date_to','')::date;
  v_max_months := GREATEST(COALESCE(m.max_period_months, 36), 1);
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from THEN
    RAISE EXCEPTION 'run_bi_metric: date_to ต้องไม่น้อยกว่า date_from';
  END IF;
  -- N1: เพดานต้องบังคับแม้ส่งวันมาข้างเดียว (ส่งแค่ date_from=1900-01-01 = สแกนทั้งตาราง)
  IF v_from IS NOT NULL THEN
    v_from := GREATEST(v_from, (COALESCE(v_to, CURRENT_DATE) - (v_max_months || ' months')::interval)::date);
  ELSIF v_to IS NOT NULL THEN
    v_from := (v_to - (v_max_months || ' months')::interval)::date;     -- ให้ขอบล่างเสมอ
  END IF;

  -- ---- LIMIT ----
  v_limit := COALESCE(NULLIF(p_params->>'limit','')::int, 1000);
  v_limit := LEAST(GREATEST(v_limit, 1), 1000);

  -- ---- มิติ: time_grain ชนะ dimension (ถ้าส่งมาทั้งคู่) ----
  v_grain := NULLIF(p_params->>'time_grain','');
  IF v_grain IS NOT NULL THEN
    IF NOT (v_grain = ANY (COALESCE(m.time_grains, '{}'::text[]))) THEN
      RAISE EXCEPTION 'run_bi_metric: time_grain % ไม่อยู่ใน allowlist ของ %', v_grain, p_metric_key;
    END IF;
    IF m.time_basis IS NULL THEN
      RAISE EXCEPTION 'run_bi_metric: metric % ไม่มี time_basis จึงจัดกลุ่มตามเวลาไม่ได้', p_metric_key;
    END IF;
    IF v_grain = 'fiscal_year' THEN
      -- ปีงบประมาณไทย ต.ค.–ก.ย. (D2: ใช้เมื่อผู้ใช้ระบุ "ปีงบประมาณ" เท่านั้น)
      v_dim_select := format(
        '(''FY'' || (extract(year from (o.%I + interval ''3 months''))::int)::text) AS dimension,',
        m.time_basis);
    ELSE
      v_dim_select := format('to_char(date_trunc(%L, o.%I), ''YYYY-MM-DD'') AS dimension,',
                             v_grain, m.time_basis);
    END IF;
    v_group_by := 'GROUP BY 1';
  ELSE
    v_dim_key := NULLIF(p_params->>'dimension','');
    IF v_dim_key IS NOT NULL THEN
      SELECT d->>'column' INTO v_dim_col
        FROM jsonb_array_elements(COALESCE(m.dimensions, '[]'::jsonb)) d
       WHERE d->>'key' = v_dim_key
       LIMIT 1;
      IF v_dim_col IS NULL THEN
        RAISE EXCEPTION 'run_bi_metric: dimension % ไม่อยู่ใน allowlist ของ %', v_dim_key, p_metric_key;
      END IF;
      v_dim_select := format('o.%I AS dimension,', v_dim_col);
      v_group_by := 'GROUP BY 1';
    END IF;
  END IF;

  -- ---- time filter (ค่าจริงส่งผ่าน $2/$3 ใน CTE __p) ----
  IF m.time_basis IS NOT NULL THEN
    IF v_from IS NOT NULL THEN
      v_time_filter := v_time_filter || format(' AND o.%I >= __p.date_from', m.time_basis);
    END IF;
    IF v_to IS NOT NULL THEN
      v_time_filter := v_time_filter || format(' AND o.%I <= __p.date_to', m.time_basis);
    END IF;
  ELSIF v_from IS NOT NULL OR v_to IS NOT NULL THEN
    RAISE EXCEPTION 'run_bi_metric: metric % เป็น snapshot ไม่รองรับช่วงวันที่', p_metric_key;
  END IF;

  -- ---- filters จาก allowlist (ค่าจริงอยู่ใน $4 = __p.f) ----
  v_filter_vals := COALESCE(p_params->'filters', '{}'::jsonb);
  IF jsonb_typeof(v_filter_vals) <> 'object' THEN
    RAISE EXCEPTION 'run_bi_metric: filters ต้องเป็น object';
  END IF;

  FOR v_key, v_val IN SELECT t.k, t.v FROM jsonb_each(v_filter_vals) AS t(k, v) LOOP
    SELECT f->>'column', COALESCE(f->>'type','text') INTO v_col, v_type
      FROM jsonb_array_elements(COALESCE(m.filters, '[]'::jsonb)) f
     WHERE f->>'key' = v_key
     LIMIT 1;
    IF v_col IS NULL THEN
      RAISE EXCEPTION 'run_bi_metric: filter % ไม่อยู่ใน allowlist ของ %', v_key, p_metric_key;
    END IF;
    CONTINUE WHEN v_val IS NULL OR jsonb_typeof(v_val) = 'null';

    IF v_type = 'text' THEN
      v_filters := v_filters || format(' AND o.%I = (__p.f->>%L)', v_col, v_key);
    ELSIF v_type = 'text_list' THEN
      IF jsonb_typeof(v_val) <> 'array' THEN
        RAISE EXCEPTION 'run_bi_metric: filter % ต้องเป็น array', v_key;
      END IF;
      v_filters := v_filters ||
        format(' AND o.%I = ANY (ARRAY(SELECT jsonb_array_elements_text(__p.f->%L)))', v_col, v_key);
    ELSIF v_type = 'number_range' THEN
      IF (v_val->>'min') IS NOT NULL THEN
        v_filters := v_filters || format(' AND o.%I >= ((__p.f->%L)->>''min'')::numeric', v_col, v_key);
      END IF;
      IF (v_val->>'max') IS NOT NULL THEN
        v_filters := v_filters || format(' AND o.%I <= ((__p.f->%L)->>''max'')::numeric', v_col, v_key);
      END IF;
    ELSIF v_type = 'date_range' THEN
      IF (v_val->>'min') IS NOT NULL THEN
        v_filters := v_filters || format(' AND o.%I >= ((__p.f->%L)->>''min'')::date', v_col, v_key);
      END IF;
      IF (v_val->>'max') IS NOT NULL THEN
        v_filters := v_filters || format(' AND o.%I <= ((__p.f->%L)->>''max'')::date', v_col, v_key);
      END IF;
    ELSIF v_type = 'boolean' THEN
      v_filters := v_filters || format(' AND o.%I = ((__p.f->>%L)::boolean)', v_col, v_key);
    ELSE
      RAISE EXCEPTION 'run_bi_metric: ไม่รองรับ filter type %', v_type;
    END IF;
  END LOOP;

  -- N3: ถ้า template ไม่มีรูให้เสียบมิติ แต่ผู้ใช้ขอจัดกลุ่ม → ห้าม "รับแล้วเงียบหาย"
  -- (ตอบก้อนเดียวที่ดูเหมือนคำตอบของ "แยกรายเดือน" = ทำลายความน่าเชื่อถือโดยตรง)
  IF (v_grain IS NOT NULL OR v_dim_key IS NOT NULL) AND position('{{dim_select}}' IN v_tpl) = 0 THEN
    RAISE EXCEPTION 'run_bi_metric: metric % จัดกลุ่มตามมิติ/ช่วงเวลาที่ขอไม่ได้ (มิติถูกกำหนดตายตัวในนิยาม)',
      p_metric_key;
  END IF;

  -- ---- render ----
  v_sql := replace(v_tpl,  '{{dim_select}}',  v_dim_select);
  v_sql := replace(v_sql,  '{{group_by}}',    v_group_by);
  v_sql := replace(v_sql,  '{{time_filter}}', v_time_filter);
  v_sql := replace(v_sql,  '{{filters}}',     v_filters);
  IF v_sql ~ '\{\{' THEN
    RAISE EXCEPTION 'run_bi_metric: sql_template ของ % ยังมี placeholder ที่ไม่รู้จัก', p_metric_key;
  END IF;

  v_final :=
    'WITH __p AS (SELECT $1::uuid AS org_id, $2::date AS date_from, $3::date AS date_to, '
    || '$4::jsonb AS f, $5::int AS lim) ' || v_sql || ' LIMIT $5';

  -- ---- guardrails ระดับ engine ----
  SET LOCAL statement_timeout = '10s';
  BEGIN
    EXECUTE 'SET LOCAL transaction_read_only = on';   -- SELECT-only จริง ไม่ใช่แค่ regex
  EXCEPTION WHEN OTHERS THEN
    NULL;                                             -- transaction เขียนไปแล้ว → ข้าม (regex ยังกันอยู่)
  END;

  EXECUTE 'SELECT COALESCE(jsonb_agg(to_jsonb(__q)), ''[]''::jsonb) FROM (' || v_final || ') __q'
    INTO v_rows
    USING p_org_id, v_from, v_to, v_filter_vals, v_limit;

  v_rows := COALESCE(v_rows, '[]'::jsonb);

  RETURN jsonb_build_object(
    'rows',        v_rows,
    'row_count',   jsonb_array_length(v_rows),
    'sql',         v_final,
    'elapsed_ms',  (extract(epoch FROM (clock_timestamp() - v_start)) * 1000)::int,
    'truncated',   (jsonb_array_length(v_rows) >= v_limit),
    'metric', jsonb_build_object(
      'key', m.key, 'label_th', m.label_th, 'definition_th', m.definition_th,
      'time_basis', m.time_basis, 'unit', m.unit, 'unit_decimals', m.unit_decimals,
      'chart_hint', m.chart_hint, 'status', m.status, 'no_summarize', m.no_summarize,
      'includes', to_jsonb(m.includes), 'excludes', to_jsonb(m.excludes)
    ),
    'effective_params', jsonb_build_object(
      'date_from', v_from, 'date_to', v_to, 'dimension', v_dim_key,
      'time_grain', v_grain, 'filters', v_filter_vals, 'limit', v_limit,
      'max_period_months', v_max_months
    )
  );
END;
$fn$;

-- ===========================================================================
-- 9) RPC match_bi_metrics — retrieval (pgvector) กรอง verified + scope + role
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.match_bi_metrics(
  p_query_embedding vector(768),
  p_scopes          text[],
  p_role            text,
  p_match_count     int   DEFAULT 5,
  p_min_similarity  float DEFAULT 0.6
)
RETURNS TABLE (
  key               text,
  label_th          text,
  definition_th     text,
  synonyms          text[],
  dimensions        jsonb,
  time_grains       text[],
  comparisons       text[],
  filters           jsonb,
  default_view      jsonb,
  chart_hint        text,
  unit              text,
  param_schema      jsonb,
  max_period_months int,
  no_summarize      boolean,
  similarity        float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.key, m.label_th, m.definition_th, m.synonyms, m.dimensions, m.time_grains,
    m.comparisons, m.filters, m.default_view, m.chart_hint, m.unit, m.param_schema,
    m.max_period_months, m.no_summarize,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.bi_metrics m
  WHERE m.status = 'verified'
    AND m.embedding IS NOT NULL
    AND m.module_scope = ANY (COALESCE(p_scopes, '{}'::text[]))
    AND p_role = ANY (m.allowed_roles)
    AND 1 - (m.embedding <=> p_query_embedding) >= COALESCE(p_min_similarity, 0.6)
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT GREATEST(COALESCE(p_match_count, 5), 1);
$$;

-- ===========================================================================
-- 10) RPC upsert_bi_metric_embedding — สคริปต์ embed (pnpm bi:embed)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.upsert_bi_metric_embedding(
  p_key       text,
  p_embedding float8[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.bi_metrics
     SET embedding = p_embedding::vector(768), updated_at = now()
   WHERE key = p_key
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'upsert_bi_metric_embedding: ไม่พบ metric %', p_key;
  END IF;
  RETURN v_id;
END; $$;

-- ===========================================================================
-- 11) RPC incr_bi_usage — rate limit ต่อคน/org/วัน (true = ยังอยู่ในโควต้า)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.incr_bi_usage(
  p_org_id      uuid,
  p_profile_id  uuid,
  p_daily_limit int DEFAULT 50
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  INSERT INTO public.bi_usage_daily (org_id, profile_id, day, count)
  VALUES (p_org_id, p_profile_id, CURRENT_DATE, 1)
  ON CONFLICT (org_id, profile_id, day)
  DO UPDATE SET count = public.bi_usage_daily.count + 1, updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count <= p_daily_limit;
END; $$;

-- ===========================================================================
-- 12) Lock down RPC — service role เท่านั้น (CONTEXT §7)
-- ===========================================================================
REVOKE ALL ON FUNCTION public.run_bi_metric(uuid, text, jsonb, text, boolean)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_bi_metrics(vector, text[], text, int, float)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_bi_metric_embedding(text, float8[])           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.incr_bi_usage(uuid, uuid, int)                       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.run_bi_metric(uuid, text, jsonb, text, boolean)    TO service_role;
GRANT EXECUTE ON FUNCTION public.match_bi_metrics(vector, text[], text, int, float) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_bi_metric_embedding(text, float8[])         TO service_role;
GRANT EXECUTE ON FUNCTION public.incr_bi_usage(uuid, uuid, int)                     TO service_role;

-- ===========================================================================
-- 13) S1(2) — ตัดสิทธิ์ PostgREST ตรง ๆ ของ client ทุกตารางของ module
--     ทุกการอ่าน/เขียนต้องผ่าน service-role + requireBiMember (contract §6.4)
--     · กัน GET /rest/v1/bi_messages?select=result_rows ด้วย JWT ของ member ธรรมดา
--     · service_role bypass RLS อยู่แล้ว → ไม่กระทบ API/SSR ที่เรียกผ่าน lib/bi/*
--     (bi_metrics / bi_usage_daily ไม่เคยถูก GRANT อยู่แล้ว — ใส่ไว้ให้ครบชัดเจน)
-- ===========================================================================
REVOKE ALL ON TABLE
  public.bi_metrics,
  public.bi_threads,
  public.bi_messages,
  public.bi_dashboards,
  public.bi_dashboard_items,
  public.bi_query_log,
  public.bi_usage_daily
FROM anon, authenticated;
