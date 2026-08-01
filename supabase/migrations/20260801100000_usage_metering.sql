-- ── Usage Metering & Cost Attribution ────────────────────────────────────────
-- วัด "ต้นทุนจริงต่อ org" ของทุกอย่างที่เสียเงินตามการใช้งาน เพื่อเอาไปออกแบบราคาขาย
--
--   ต้นทุนแปรผัน (metered)  → usage_events   : Gemini token, LINE push, Recall, Cloud Run, storage
--   ต้นทุนคงที่ (fixed)      → usage_fixed_costs : Vercel/Supabase/โดเมน — ปันส่วนเข้า org ตามสัดส่วนการใช้
--   ราคาต่อหน่วย            → usage_prices   : super_admin แก้ได้ ไม่ต้อง deploy
--
-- หลักการสำคัญ
--   1) cost_usd ถูก "freeze ตอนเขียน" — ราคาที่เปลี่ยนวันนี้ต้องไม่ย้อนแก้ต้นทุนเดือนก่อน
--   2) append-only — ไม่มี UPDATE/DELETE policy · RLS deny-all (service-role เท่านั้น)
--   3) แหล่งที่ log อยู่แล้ว (assistant_jobs / acc_firm_ai_log / bi_query_log) ต่อด้วย
--      **trigger ที่ DB** ไม่ใช่โค้ดแอป → worker บน Cloud Run ไม่ต้อง redeploy ก็นับครบ
--   4) org_id NULL ได้ = ต้นทุนที่ยังผูก org ไม่ได้ (เช่น pre-sales chat) — ต้องเห็นในรายงานว่า "ไม่ระบุ"

BEGIN;

-- ── 1. usage_settings (singleton) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usage_settings (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),
  usd_thb_rate   numeric(10,4) NOT NULL DEFAULT 35 CHECK (usd_thb_rate > 0),
  target_margin  numeric(6,4)  NOT NULL DEFAULT 2.5 CHECK (target_margin >= 1),  -- ตัวคูณ "ราคาขายที่ควรเป็น"
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.usage_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.usage_settings ENABLE ROW LEVEL SECURITY;

-- ── 2. usage_prices — ราคาต่อหน่วยของทุกทรัพยากร ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.usage_prices (
  key            text PRIMARY KEY,
  service        text NOT NULL CHECK (service IN ('gemini','line','recall','compute','storage','other')),
  label          text NOT NULL,
  unit           text NOT NULL CHECK (unit IN ('token','message','second','page','request','gb_month','job')),
  unit_cost_usd  numeric(18,12) NOT NULL CHECK (unit_cost_usd >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.usage_prices ENABLE ROW LEVEL SECURITY;

-- ราคา ณ 2026-08 (Gemini paid tier, USD ต่อ 1 token = ราคาต่อล้าน ÷ 1e6)
INSERT INTO public.usage_prices (key, service, label, unit, unit_cost_usd) VALUES
  ('gemini-2.5-flash:text_in',  'gemini',  'Gemini 2.5 Flash — input (ข้อความ)',   'token',   0.000000300),
  ('gemini-2.5-flash:audio_in', 'gemini',  'Gemini 2.5 Flash — input (เสียง)',     'token',   0.000001000),
  ('gemini-2.5-flash:out',      'gemini',  'Gemini 2.5 Flash — output',            'token',   0.000002500),
  ('gemini-2.5-pro:text_in',    'gemini',  'Gemini 2.5 Pro — input',               'token',   0.000001250),
  ('gemini-2.5-pro:out',        'gemini',  'Gemini 2.5 Pro — output',              'token',   0.000010000),
  ('gemini-2.5-flash-lite:text_in','gemini','Gemini 2.5 Flash-Lite — input',       'token',   0.000000100),
  ('gemini-2.5-flash-lite:out', 'gemini',  'Gemini 2.5 Flash-Lite — output',       'token',   0.000000400),
  ('gemini-embedding-001:in',   'gemini',  'Gemini Embedding — input',             'token',   0.000000150),
  ('line:push_message',         'line',    'LINE — ข้อความที่ส่งออก (push/reply)', 'message', 0.001500000),
  ('recall:bot_second',         'recall',  'Recall.ai — บอทเข้าประชุม',            'second',  0.000138889),
  ('compute:cloudrun_second',   'compute', 'Cloud Run — worker ทำงาน',             'second',  0.000034000),
  ('compute:pdf_page',          'compute', 'PDF renderer — ต่อหน้า',               'page',    0.000200000),
  ('storage:gb_month',          'storage', 'Supabase Storage — ต่อ GB ต่อเดือน',   'gb_month',0.021000000)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.usage_price_usd(p_key text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT unit_cost_usd FROM public.usage_prices WHERE key = p_key AND is_active), 0);
$$;

-- ── 3. usage_events — ledger ต้นทุนแปรผัน (append-only) ───────────────────────
CREATE TABLE IF NOT EXISTS public.usage_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  profile_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  service        text NOT NULL CHECK (service IN ('gemini','line','recall','compute','storage','other')),
  feature        text NOT NULL,                 -- 'stt.mom' | 'bi.ask' | 'tmc.sales_bot' | 'line.push' …
  resource       text,                          -- ชื่อโมเดล / ชนิดข้อความ / ชื่อ worker
  quantity       numeric(20,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit           text NOT NULL CHECK (unit IN ('token','message','second','page','request','gb_month','job')),
  input_tokens   bigint NOT NULL DEFAULT 0,
  output_tokens  bigint NOT NULL DEFAULT 0,
  cost_usd       numeric(18,10) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  ref_table      text,
  ref_id         uuid,
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_created_idx     ON public.usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_org_created_idx ON public.usage_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_service_idx     ON public.usage_events (service, created_at DESC);
-- กันนับซ้ำเวลา trigger ยิงซ้ำ / backfill ทับ
CREATE UNIQUE INDEX IF NOT EXISTS usage_events_ref_uniq
  ON public.usage_events (ref_table, ref_id, feature) WHERE ref_id IS NOT NULL;

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy = deny-all สำหรับ anon/authenticated · service_role bypass RLS
REVOKE ALL ON public.usage_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.usage_events TO service_role;

-- ── 4. usage_fixed_costs — ต้นทุนคงที่รายเดือน (Vercel/Supabase/โดเมน/ผู้ให้บริการ) ──
CREATE TABLE IF NOT EXISTS public.usage_fixed_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month       date NOT NULL,                     -- วันที่ 1 ของเดือน
  label       text NOT NULL,
  amount_usd  numeric(14,4) NOT NULL CHECK (amount_usd >= 0),
  allocation  text NOT NULL DEFAULT 'pro_rata' CHECK (allocation IN ('pro_rata','per_org','none')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (month, label)
);
ALTER TABLE public.usage_fixed_costs ENABLE ROW LEVEL SECURITY;

-- ── 5. Trigger: assistant_jobs → usage_events (Gemini + Recall) ────────────────
-- ยิงเมื่อ job ถึง completed · worker เขียน assistant_jobs อยู่แล้ว → ไม่ต้องแก้ Cloud Run
CREATE OR REPLACE FUNCTION public.usage_event_from_assistant_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_audio_in  bigint;
  v_text_in   bigint;
  v_out       bigint;
  v_cost      numeric;
  v_seconds   numeric;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  v_seconds  := COALESCE(NEW.duration_seconds, 0);
  v_audio_in := COALESCE(NEW.audio_input_tokens, GREATEST(0, ROUND(v_seconds * 32)));
  v_text_in  := GREATEST(0, COALESCE(NEW.prompt_tokens, v_audio_in) - v_audio_in);
  v_out      := COALESCE(NEW.output_tokens, 0) + COALESCE(NEW.thoughts_tokens, 0);

  v_cost := v_audio_in * public.usage_price_usd('gemini-2.5-flash:audio_in')
          + v_text_in  * public.usage_price_usd('gemini-2.5-flash:text_in')
          + v_out      * public.usage_price_usd('gemini-2.5-flash:out');

  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit,
     input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.org_id, NEW.profile_id, 'gemini',
     'assistant.' || COALESCE(NEW.kind, 'stt'),
     COALESCE(NEW.model, 'gemini-2.5-flash'),
     v_audio_in + v_text_in + v_out, 'token',
     v_audio_in + v_text_in, v_out, v_cost,
     'assistant_jobs', NEW.id,
     jsonb_build_object('seconds', v_seconds, 'source', NEW.source,
                        'exact', NEW.prompt_tokens IS NOT NULL),
     COALESCE(NEW.updated_at, now()))
  ON CONFLICT DO NOTHING;

  -- บอทเข้าประชุม (Recall.ai) คิดตามวินาทีที่อัดจริง
  IF NEW.recall_bot_id IS NOT NULL AND v_seconds > 0 THEN
    INSERT INTO public.usage_events
      (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
       ref_table, ref_id, meta, created_at)
    VALUES
      (NEW.org_id, NEW.profile_id, 'recall', 'assistant.meeting_bot', 'recall.ai',
       v_seconds, 'second', v_seconds * public.usage_price_usd('recall:bot_second'),
       'assistant_jobs', NEW.id, jsonb_build_object('bot_id', NEW.recall_bot_id),
       COALESCE(NEW.updated_at, now()))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- การวัดต้นทุนห้ามทำให้ธุรกรรมหลักล้ม — job ที่เสร็จแล้วต้องเสร็จ แม้ metering พัง
  RAISE WARNING 'usage_event_from_assistant_job failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usage_event_assistant_job ON public.assistant_jobs;
CREATE TRIGGER usage_event_assistant_job
  AFTER INSERT OR UPDATE OF status ON public.assistant_jobs
  FOR EACH ROW EXECUTE FUNCTION public.usage_event_from_assistant_job();

-- ── 6. Trigger: acc_firm_ai_log → usage_events ────────────────────────────────
CREATE OR REPLACE FUNCTION public.usage_event_from_acc_firm_ai()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cost numeric;
BEGIN
  v_cost := CASE WHEN NEW.cost_usd > 0 THEN NEW.cost_usd
    ELSE COALESCE(NEW.input_tokens,0)  * public.usage_price_usd('gemini-2.5-flash:text_in')
       + COALESCE(NEW.output_tokens,0) * public.usage_price_usd('gemini-2.5-flash:out') END;

  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit,
     input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.firm_org_id, NEW.triggered_by, 'gemini', 'acc_firm.' || NEW.feature, NEW.model,
     COALESCE(NEW.input_tokens,0) + COALESCE(NEW.output_tokens,0), 'token',
     COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0), v_cost,
     'acc_firm_ai_log', NEW.id,
     jsonb_build_object('client_org_id', NEW.client_org_id), NEW.created_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'usage_event_from_acc_firm_ai failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usage_event_acc_firm_ai ON public.acc_firm_ai_log;
CREATE TRIGGER usage_event_acc_firm_ai
  AFTER INSERT ON public.acc_firm_ai_log
  FOR EACH ROW EXECUTE FUNCTION public.usage_event_from_acc_firm_ai();

-- ── 7. Trigger: bi_query_log → usage_events ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.usage_event_from_bi_query()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cost numeric;
BEGIN
  v_cost := CASE WHEN COALESCE(NEW.cost_usd,0) > 0 THEN NEW.cost_usd
    ELSE COALESCE(NEW.token_in,0)  * public.usage_price_usd('gemini-2.5-flash:text_in')
       + COALESCE(NEW.token_out,0) * public.usage_price_usd('gemini-2.5-flash:out') END;

  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit,
     input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.org_id, NEW.profile_id, 'gemini', 'bi.ask', COALESCE(NEW.model,'gemini-2.5-flash'),
     COALESCE(NEW.token_in,0) + COALESCE(NEW.token_out,0), 'token',
     COALESCE(NEW.token_in,0), COALESCE(NEW.token_out,0), v_cost,
     'bi_query_log', NEW.id, jsonb_build_object('source', NEW.source), NEW.created_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'usage_event_from_bi_query failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usage_event_bi_query ON public.bi_query_log;
CREATE TRIGGER usage_event_bi_query
  AFTER INSERT ON public.bi_query_log
  FOR EACH ROW EXECUTE FUNCTION public.usage_event_from_bi_query();

-- ── 8. Backfill ประวัติเดิม (idempotent ด้วย usage_events_ref_uniq) ────────────
INSERT INTO public.usage_events
  (org_id, profile_id, service, feature, resource, quantity, unit,
   input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
SELECT
  j.org_id, j.profile_id, 'gemini', 'assistant.' || COALESCE(j.kind,'stt'),
  COALESCE(j.model,'gemini-2.5-flash'),
  a.audio_in + a.text_in + a.out_tok, 'token',
  a.audio_in + a.text_in, a.out_tok,
  a.audio_in * public.usage_price_usd('gemini-2.5-flash:audio_in')
  + a.text_in * public.usage_price_usd('gemini-2.5-flash:text_in')
  + a.out_tok * public.usage_price_usd('gemini-2.5-flash:out'),
  'assistant_jobs', j.id,
  jsonb_build_object('backfill', true, 'source', j.source),
  COALESCE(j.updated_at, j.created_at)
FROM public.assistant_jobs j
CROSS JOIN LATERAL (
  SELECT
    COALESCE(j.audio_input_tokens, GREATEST(0, ROUND(COALESCE(j.duration_seconds,0) * 32)))::bigint AS audio_in,
    GREATEST(0, COALESCE(j.prompt_tokens, COALESCE(j.audio_input_tokens,0)) -
                COALESCE(j.audio_input_tokens, GREATEST(0, ROUND(COALESCE(j.duration_seconds,0) * 32))))::bigint AS text_in,
    (COALESCE(j.output_tokens,0) + COALESCE(j.thoughts_tokens,0))::bigint AS out_tok
) a
WHERE j.status = 'completed'
ON CONFLICT DO NOTHING;

INSERT INTO public.usage_events
  (org_id, profile_id, service, feature, resource, quantity, unit,
   input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
SELECT l.firm_org_id, l.triggered_by, 'gemini', 'acc_firm.' || l.feature, l.model,
  COALESCE(l.input_tokens,0) + COALESCE(l.output_tokens,0), 'token',
  COALESCE(l.input_tokens,0), COALESCE(l.output_tokens,0),
  CASE WHEN l.cost_usd > 0 THEN l.cost_usd
    ELSE COALESCE(l.input_tokens,0)  * public.usage_price_usd('gemini-2.5-flash:text_in')
       + COALESCE(l.output_tokens,0) * public.usage_price_usd('gemini-2.5-flash:out') END,
  'acc_firm_ai_log', l.id, '{"backfill":true}'::jsonb, l.created_at
FROM public.acc_firm_ai_log l
ON CONFLICT DO NOTHING;

INSERT INTO public.usage_events
  (org_id, profile_id, service, feature, resource, quantity, unit,
   input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
SELECT q.org_id, q.profile_id, 'gemini', 'bi.ask', COALESCE(q.model,'gemini-2.5-flash'),
  COALESCE(q.token_in,0) + COALESCE(q.token_out,0), 'token',
  COALESCE(q.token_in,0), COALESCE(q.token_out,0),
  CASE WHEN COALESCE(q.cost_usd,0) > 0 THEN q.cost_usd
    ELSE COALESCE(q.token_in,0)  * public.usage_price_usd('gemini-2.5-flash:text_in')
       + COALESCE(q.token_out,0) * public.usage_price_usd('gemini-2.5-flash:out') END,
  'bi_query_log', q.id, '{"backfill":true}'::jsonb, q.created_at
FROM public.bi_query_log q
ON CONFLICT DO NOTHING;

-- ── 9. RPC รายงาน (service-role เท่านั้น — หน้า /admin/usage ใช้) ─────────────
-- สรุปต่อ org: ต้นทุนรวม + แยกตามบริการ (jsonb) + จำนวน event
CREATE OR REPLACE FUNCTION public.admin_usage_by_org(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  org_id uuid, org_name text, org_slug text,
  cost_usd numeric, events bigint,
  in_tokens bigint, out_tokens bigint,
  by_service jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT org_id, service, cost_usd, input_tokens, output_tokens
    FROM public.usage_events
    WHERE created_at >= p_from AND created_at < p_to
  ), per_svc AS (
    SELECT org_id, service, SUM(cost_usd) AS c FROM e GROUP BY 1, 2
  )
  SELECT
    e.org_id,
    COALESCE(o.name, 'ไม่ระบุองค์กร')::text,
    COALESCE(o.slug, '—')::text,
    SUM(e.cost_usd)::numeric,
    COUNT(*)::bigint,
    SUM(e.input_tokens)::bigint,
    SUM(e.output_tokens)::bigint,
    COALESCE((SELECT jsonb_object_agg(p.service, ROUND(p.c, 6))
              FROM per_svc p WHERE p.org_id IS NOT DISTINCT FROM e.org_id), '{}'::jsonb)
  FROM e LEFT JOIN public.organizations o ON o.id = e.org_id
  GROUP BY e.org_id, o.name, o.slug
  ORDER BY 4 DESC;
$$;

-- แยกตามบริการ/ฟีเจอร์ (ทั้งระบบ หรือเจาะ org เดียว)
CREATE OR REPLACE FUNCTION public.admin_usage_by_feature(
  p_from timestamptz, p_to timestamptz, p_org_id uuid DEFAULT NULL
) RETURNS TABLE (
  service text, feature text, resource text, unit text,
  quantity numeric, events bigint, cost_usd numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT service, feature, COALESCE(resource,'—')::text, unit,
         SUM(quantity)::numeric, COUNT(*)::bigint, SUM(cost_usd)::numeric
  FROM public.usage_events
  WHERE created_at >= p_from AND created_at < p_to
    AND (p_org_id IS NULL OR org_id = p_org_id)
  GROUP BY 1, 2, 3, 4
  ORDER BY 7 DESC;
$$;

-- แนวโน้มรายวัน (เวลาไทย)
CREATE OR REPLACE FUNCTION public.admin_usage_daily(
  p_from timestamptz, p_to timestamptz, p_org_id uuid DEFAULT NULL
) RETURNS TABLE (day date, cost_usd numeric, events bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date,
         SUM(cost_usd)::numeric, COUNT(*)::bigint
  FROM public.usage_events
  WHERE created_at >= p_from AND created_at < p_to
    AND (p_org_id IS NULL OR org_id = p_org_id)
  GROUP BY 1 ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.admin_usage_by_org(timestamptz, timestamptz)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_feature(timestamptz, timestamptz, uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_daily(timestamptz, timestamptz, uuid)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_price_usd(text)                                       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_org(timestamptz, timestamptz)             TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_feature(timestamptz, timestamptz, uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_daily(timestamptz, timestamptz, uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_price_usd(text)                                    TO service_role;

REVOKE ALL ON public.usage_prices, public.usage_settings, public.usage_fixed_costs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_prices, public.usage_settings, public.usage_fixed_costs TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
