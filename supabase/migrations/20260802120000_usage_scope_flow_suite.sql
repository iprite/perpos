-- ── แยกต้นทุน Flow (ต่อผู้ใช้) ออกจาก Suite (ต่อองค์กร) ──────────────────────
--
-- ปัญหาที่แก้: ผู้ช่วย AI (Flow) เป็นบริการ **per-profile** แต่ usage_events ผูก org_id
-- ตาม "home org" ของคนใช้ → คนที่เป็นสมาชิกองค์กรลูกค้าอยู่แล้ว (super_admin, พนักงาน)
-- ทำให้ต้นทุนส่วนตัวไปกองที่องค์กรลูกค้า เช่น justme กลายเป็นองค์กรที่แพงที่สุดทั้งที่
-- ไม่เคยเรียก worker เอง (งานทั้งหมดมาจาก LINE ของ super_admin)
--
-- กติกาใหม่ (ถาวร):
--   scope = 'flow'  → ต้นทุน per-profile — **ไม่เรียกว่าองค์กร ให้รายงานเป็น "ผู้ใช้"**
--   scope = 'suite' → ต้นทุนของ ERP ต่อองค์กรจริง
-- ตัดสินโดย trigger ตอน INSERT (ห้ามให้ผู้เรียกส่งเอง — จะเพี้ยนตามคนเขียนโค้ด)

BEGIN;

-- ── 1. ทำเครื่องหมาย "พื้นที่ส่วนตัว" ที่ระดับ org ─────────────────────────────
--    เดิมรู้ได้ทางเดียวคือ profiles.personal_org_id ซึ่ง join ยากตอน INSERT
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_personal IS
  'true = org "พื้นที่ส่วนตัว" ที่ provisioning สร้างให้ผู้ใช้ (home org ของ Flow) — ไม่ใช่องค์กรลูกค้า';

--    เงื่อนไข "มีสมาชิกคนเดียวและเป็นเจ้าของที่อ้างถึง org นี้" กัน org ลูกค้าจริง
--    ที่เคยถูก resolve ผิดมาเป็น personal_org_id ไม่ให้ถูกตีตราเป็นพื้นที่ส่วนตัว
UPDATE public.organizations o
   SET is_personal = true
 WHERE o.is_personal = false
   AND EXISTS (
     SELECT 1 FROM public.profiles p
      WHERE p.personal_org_id = o.id
        AND (SELECT count(*) FROM public.organization_members m
              WHERE m.organization_id = o.id) = 1
        AND EXISTS (SELECT 1 FROM public.organization_members m2
                     WHERE m2.organization_id = o.id AND m2.user_id = p.id)
   );

-- ── 2. profile ที่ยังไม่มีพื้นที่ส่วนตัว → สร้างให้ ───────────────────────────
--    ถ้าไม่มี personal_org_id, resolveHomeOrg จะ fallback ไป membership จริง
--    (= org ลูกค้า) ซึ่งเป็นต้นตอของบั๊กนี้
DO $$
DECLARE
  r        record;
  v_org_id uuid;
BEGIN
  FOR r IN
    SELECT id, COALESCE(NULLIF(display_name, ''), 'ผู้ใช้') AS nm
      FROM public.profiles
     WHERE personal_org_id IS NULL
  LOOP
    INSERT INTO public.organizations (name, slug, created_by, is_personal)
    VALUES (
      'พื้นที่ส่วนตัว — ' || r.nm,
      'u' || substr(md5(random()::text || r.id::text), 1, 10),
      r.id,
      true
    )
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, r.id, 'owner')
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles SET personal_org_id = v_org_id WHERE id = r.id;
  END LOOP;
END $$;

-- ── 3. usage_events.scope ─────────────────────────────────────────────────────
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'suite';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usage_events_scope_check'
  ) THEN
    ALTER TABLE public.usage_events
      ADD CONSTRAINT usage_events_scope_check CHECK (scope IN ('flow', 'suite'));
  END IF;
END $$;

COMMENT ON COLUMN public.usage_events.scope IS
  'flow = ต้นทุนต่อผู้ใช้ (ผู้ช่วย AI per-profile) · suite = ต้นทุนต่อองค์กร (ERP) — ตั้งโดย trigger เท่านั้น';

CREATE OR REPLACE FUNCTION public.usage_events_set_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.scope := CASE
    -- ผู้ช่วย AI ทุก kind (stt / pdf_compress / …) เป็น per-profile เสมอ
    WHEN NEW.feature LIKE 'assistant.%' THEN 'flow'
    -- ต้นทุนที่เกิดในพื้นที่ส่วนตัว = ของคนคนนั้น ไม่ใช่ขององค์กร
    WHEN NEW.org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organizations o WHERE o.id = NEW.org_id AND o.is_personal
    ) THEN 'flow'
    ELSE 'suite'
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_usage_events_scope ON public.usage_events;
CREATE TRIGGER trg_usage_events_scope
  BEFORE INSERT ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.usage_events_set_scope();

-- backfill ประวัติเดิมด้วยกติกาเดียวกัน (cost_usd ไม่ถูกแตะ — freeze ตามเดิม)
UPDATE public.usage_events e
   SET scope = CASE
     WHEN e.feature LIKE 'assistant.%' THEN 'flow'
     WHEN e.org_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.organizations o WHERE o.id = e.org_id AND o.is_personal
     ) THEN 'flow'
     ELSE 'suite'
   END
 WHERE scope IS DISTINCT FROM CASE
     WHEN e.feature LIKE 'assistant.%' THEN 'flow'
     WHEN e.org_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.organizations o WHERE o.id = e.org_id AND o.is_personal
     ) THEN 'flow'
     ELSE 'suite'
   END;

CREATE INDEX IF NOT EXISTS usage_events_scope_created_idx
  ON public.usage_events (scope, created_at DESC);

-- ── 4. RPC — ต่อองค์กร (Suite เท่านั้น) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_usage_by_org(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(org_id uuid, org_name text, org_slug text, cost_usd numeric,
              events bigint, in_tokens bigint, out_tokens bigint, by_service jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT org_id, service, cost_usd, input_tokens, output_tokens
    FROM public.usage_events
    WHERE created_at >= p_from AND created_at < p_to AND scope = 'suite'
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

-- ── 5. RPC ใหม่ — ต่อผู้ใช้ (Flow) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_usage_by_user(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(profile_id uuid, display_name text, email text, cost_usd numeric,
              events bigint, in_tokens bigint, out_tokens bigint, by_service jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT profile_id, service, cost_usd, input_tokens, output_tokens
    FROM public.usage_events
    WHERE created_at >= p_from AND created_at < p_to AND scope = 'flow'
  ), per_svc AS (
    SELECT profile_id, service, SUM(cost_usd) AS c FROM e GROUP BY 1, 2
  )
  SELECT
    e.profile_id,
    COALESCE(NULLIF(pr.display_name, ''), 'ไม่ระบุผู้ใช้')::text,
    COALESCE(pr.email, '—')::text,
    SUM(e.cost_usd)::numeric,
    COUNT(*)::bigint,
    SUM(e.input_tokens)::bigint,
    SUM(e.output_tokens)::bigint,
    COALESCE((SELECT jsonb_object_agg(p.service, ROUND(p.c, 6))
              FROM per_svc p WHERE p.profile_id IS NOT DISTINCT FROM e.profile_id), '{}'::jsonb)
  FROM e LEFT JOIN public.profiles pr ON pr.id = e.profile_id
  GROUP BY e.profile_id, pr.display_name, pr.email
  ORDER BY 4 DESC;
$$;

-- ── 6. เจาะราย feature / รายวัน — กรองได้ทั้ง org, ผู้ใช้ และ scope ───────────
DROP FUNCTION IF EXISTS public.admin_usage_by_feature(timestamptz, timestamptz, uuid);
CREATE FUNCTION public.admin_usage_by_feature(
  p_from timestamptz, p_to timestamptz,
  p_org_id uuid DEFAULT NULL, p_profile_id uuid DEFAULT NULL, p_scope text DEFAULT NULL
)
RETURNS TABLE(service text, feature text, resource text, unit text,
              quantity numeric, events bigint, cost_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT service, feature, COALESCE(resource, '—')::text, unit,
         SUM(quantity)::numeric, COUNT(*)::bigint, SUM(cost_usd)::numeric
  FROM public.usage_events
  WHERE created_at >= p_from AND created_at < p_to
    AND (p_org_id     IS NULL OR org_id     = p_org_id)
    AND (p_profile_id IS NULL OR profile_id = p_profile_id)
    AND (p_scope      IS NULL OR scope      = p_scope)
  GROUP BY 1, 2, 3, 4
  ORDER BY 7 DESC;
$$;

DROP FUNCTION IF EXISTS public.admin_usage_daily(timestamptz, timestamptz, uuid);
CREATE FUNCTION public.admin_usage_daily(
  p_from timestamptz, p_to timestamptz,
  p_org_id uuid DEFAULT NULL, p_profile_id uuid DEFAULT NULL, p_scope text DEFAULT NULL
)
RETURNS TABLE(day date, cost_usd numeric, events bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date,
         SUM(cost_usd)::numeric, COUNT(*)::bigint
  FROM public.usage_events
  WHERE created_at >= p_from AND created_at < p_to
    AND (p_org_id     IS NULL OR org_id     = p_org_id)
    AND (p_profile_id IS NULL OR profile_id = p_profile_id)
    AND (p_scope      IS NULL OR scope      = p_scope)
  GROUP BY 1 ORDER BY 1;
$$;

-- ── 7. สิทธิ์ — service-role เท่านั้นเหมือนเดิม ───────────────────────────────
REVOKE ALL ON FUNCTION public.admin_usage_by_org(timestamptz, timestamptz)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_user(timestamptz, timestamptz)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_feature(timestamptz, timestamptz, uuid, uuid, text)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_daily(timestamptz, timestamptz, uuid, uuid, text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_events_set_scope()                                            FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_usage_by_org(timestamptz, timestamptz)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_user(timestamptz, timestamptz)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_feature(timestamptz, timestamptz, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_daily(timestamptz, timestamptz, uuid, uuid, text)      TO service_role;

COMMIT;
