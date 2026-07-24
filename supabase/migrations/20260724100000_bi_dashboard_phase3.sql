-- ============================================================================
-- bi — Phase 3 (แดชบอร์ดปักหมุด) · DB1–DB6
-- Contract: .claude/feature-factory/specs/bi-dashboard.md §2.1 (Naming Lock — DB)
--           .claude/module-factory/specs/bi.md §4 Phase 3 · §13 P3-D1/P3-D2
--
-- ⚠️ ADDITIVE เท่านั้น — module `bi` ใช้งานจริงบน prod แล้ว (org p2p-x-89)
--    migration 6 ไฟล์ของ Phase 1 apply prod ไปแล้ว → ไฟล์นี้ห้ามแก้ของเดิม
--    ทุก statement idempotent (IF NOT EXISTS / DROP … IF EXISTS ก่อน CREATE)
--
-- กฎที่ยึด (module-factory CONTEXT §7):
--   · ตารางราย org: org_id NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
--     (ของเดิมมีครบแล้ว — ไฟล์นี้ไม่สร้างตารางใหม่)
--   · ENABLE ROW LEVEL SECURITY ทุกตาราง + policy SELECT/write
--     SELECT ของ dashboard = "ส่วนตัว" (P3-D1) → created_by = auth.uid() AND is_org_member(...)
--     write = is_org_admin(...) (ท่าเดียวกับ bi_threads/bi_messages) · สิทธิ์เขียนจริงคุมที่ API (canWriteBi)
--   · RPC SECURITY DEFINER: SET search_path = public
--     + REVOKE ALL FROM PUBLIC, anon, authenticated + GRANT EXECUTE TO service_role
--   · trigger updated_at ใช้ public.set_updated_at() (มีจริงในรีโป —
--     นิยามที่ 20260427160000_customers_updated_at.sql / 20260427162000_user_assets_signature_stamp.sql)
--
-- ⚠️ R4 = ความเสี่ยงสูงสุดของรอบนี้: DB3/DB4 ALTER CHECK ของ source
--    ถ้าพลาด → ระบบตอบคำถามของ Phase 1 ล่มทันที (ทุกการเขียน bi_messages/bi_query_log)
--    วิธีที่ใช้: DROP CONSTRAINT IF EXISTS แล้ว ADD ชื่อเดิม พร้อม "ค่าเดิมครบ + ค่าใหม่"
--    → เซ็ตใหม่เป็น superset ของเซ็ตเดิม ⇒ ไม่มีแถวเดิมผิด และ path เดิมเขียนได้เหมือนเดิม
--    (query ตรวจหลัง apply อยู่ท้ายไฟล์)
--
-- ⚠️ ไม่แตะตาราง/ฟังก์ชันของ gov_procure
-- ============================================================================

BEGIN;

-- ===========================================================================
-- DB1) bi_dashboard_items.updated_at + trigger
--      การ์ดแก้ชื่อ/params/ลำดับได้ ⇒ ต้องรู้ว่าแก้ล่าสุดเมื่อไร
--      (bi_dashboards มี updated_at + trigger อยู่แล้วตั้งแต่ Phase 1)
-- ===========================================================================
ALTER TABLE public.bi_dashboard_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_bi_dashboard_items_updated ON public.bi_dashboard_items;
CREATE TRIGGER trg_bi_dashboard_items_updated
  BEFORE UPDATE ON public.bi_dashboard_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- DB2) bi_usage_daily.dashboard_count — โควตาการ์ด "แยกจาก" โควตาคำถาม AI (P3-D2)
--      คอลัมน์ `count` เดิม = จำนวนคำถามที่เรียก LLM → ห้ามให้การ์ดไปกินโควตาเดียวกัน
--      (การ์ด/drill-down ไม่เรียก AI เลย)
-- ===========================================================================
ALTER TABLE public.bi_usage_daily
  ADD COLUMN IF NOT EXISTS dashboard_count int NOT NULL DEFAULT 0;

-- ===========================================================================
-- DB3) CHECK bi_query_log_source_chk → รับ 'dashboard'
--      ค่าเดิมครบ: 'web','line' (จาก 20260724090000_bi_schema.sql:294)
-- ===========================================================================
ALTER TABLE public.bi_query_log DROP CONSTRAINT IF EXISTS bi_query_log_source_chk;
ALTER TABLE public.bi_query_log
  ADD CONSTRAINT bi_query_log_source_chk
  CHECK (source IN ('web','line','dashboard'));

-- ===========================================================================
-- DB4) CHECK bi_messages_source_chk → รับ 'dashboard' (ให้ enum ตรงกันทั้งระบบ)
--      ค่าเดิมครบ: 'web','line' (จาก 20260724090000_bi_schema.sql:161)
--      หมายเหตุ: การ์ด "ไม่เขียน" bi_messages ในเฟสนี้ (R5) — ขยายไว้ให้ enum สอดคล้องเท่านั้น
-- ===========================================================================
ALTER TABLE public.bi_messages DROP CONSTRAINT IF EXISTS bi_messages_source_chk;
ALTER TABLE public.bi_messages
  ADD CONSTRAINT bi_messages_source_chk
  CHECK (source IN ('web','line','dashboard'));

-- ===========================================================================
-- DB6) index bi_dashboards_owner_idx — ทุก query ถูกกรอง created_by เสมอ (P3-D1)
-- ===========================================================================
CREATE INDEX IF NOT EXISTS bi_dashboards_owner_idx
  ON public.bi_dashboards (org_id, created_by, updated_at DESC);

-- ===========================================================================
-- RLS — รัดให้ตรง P3-D1 (แดชบอร์ดเป็นของส่วนตัว)
--   Phase 1 ตั้ง SELECT ไว้กว้าง (is_org_member ทั้ง org) เพราะยังไม่มีใครใช้
--   ตอนนี้มีคนใช้จริง ⇒ รัดให้ตรงความจริง ท่าเดียวกับ bi_threads / bi_messages
--   หมายเหตุ: ตารางถูก REVOKE จาก anon/authenticated แล้ว (bi_schema §13)
--   ⇒ RLS เป็นชั้นสำรอง · ด่านจริงคือโค้ด (lib/bi/dashboards.ts กรอง created_by เอง)
-- ===========================================================================
ALTER TABLE public.bi_dashboards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bi_dashboard_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bi_dashboards_select ON public.bi_dashboards;
CREATE POLICY bi_dashboards_select ON public.bi_dashboards
  FOR SELECT USING (created_by = auth.uid() AND public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS bi_dashboards_write ON public.bi_dashboards;
CREATE POLICY bi_dashboards_write ON public.bi_dashboards
  FOR ALL USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

-- item ไม่มี created_by (ตั้งใจ — เจ้าของอยู่ที่ dashboard ที่เดียว §2.1)
-- ⇒ ผูก EXISTS กับ dashboard ที่ตัวเองเป็นเจ้าของ (ท่าเดียวกับ bi_messages ↔ bi_threads)
DROP POLICY IF EXISTS bi_dashboard_items_select ON public.bi_dashboard_items;
CREATE POLICY bi_dashboard_items_select ON public.bi_dashboard_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.bi_dashboards d
     WHERE d.id = dashboard_id
       AND d.created_by = auth.uid()
       AND public.is_org_member(d.org_id, auth.uid())
  ));

DROP POLICY IF EXISTS bi_dashboard_items_write ON public.bi_dashboard_items;
CREATE POLICY bi_dashboard_items_write ON public.bi_dashboard_items
  FOR ALL USING (public.is_org_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_admin(org_id, auth.uid()));

-- ===========================================================================
-- DB5) RPC incr_bi_dashboard_usage — โควตาการ์ด (คนละมิเตอร์กับ incr_bi_usage)
--      · นับ "ต่อการเปิดหน้า / ต่อคำขอ" ไม่ใช่ต่อการ์ด (P3-D2)
--        ⇒ /api/bi/dashboards/[id]/run รันหลายการ์ดใน 1 คำขอ = +1 ครั้งเดียว
--      · upsert อะตอมมิกเหมือน incr_bi_usage (ON CONFLICT DO UPDATE … RETURNING)
--      · คืน true = ยังอยู่ในโควตา
--      · ห้ามแตะคอลัมน์ count (โควตาคำถาม AI) เด็ดขาด — R6
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.incr_bi_dashboard_usage(
  p_org_id      uuid,
  p_profile_id  uuid,
  p_daily_limit int DEFAULT 200
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF p_org_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'incr_bi_dashboard_usage: ต้องระบุ org_id และ profile_id';
  END IF;

  INSERT INTO public.bi_usage_daily (org_id, profile_id, day, dashboard_count)
  VALUES (p_org_id, p_profile_id, CURRENT_DATE, 1)
  ON CONFLICT (org_id, profile_id, day)
  DO UPDATE SET dashboard_count = public.bi_usage_daily.dashboard_count + 1,
                updated_at      = now()
  RETURNING dashboard_count INTO v_count;

  RETURN v_count <= COALESCE(p_daily_limit, 200);
END; $$;

REVOKE ALL ON FUNCTION public.incr_bi_dashboard_usage(uuid, uuid, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.incr_bi_dashboard_usage(uuid, uuid, int) TO service_role;

COMMIT;

-- ===========================================================================
-- VERIFY หลัง apply (รันมือ — ไม่ใช่ส่วนหนึ่งของ migration)
--
-- 1) R4: ค่าเดิมทุกค่ายัง insert ผ่าน + ค่าใหม่ผ่าน + ค่ามั่วยังถูกปฏิเสธ
--    (ทำใน transaction แล้ว ROLLBACK — ห้าม commit ข้อมูลทดสอบลง prod)
--
--    BEGIN;
--      -- ใช้ org/profile จริงที่มีอยู่ (p2p-x-89) เพราะ FK บังคับ
--      WITH o AS (SELECT id FROM organizations WHERE slug = 'p2p-x-89'),
--           p AS (SELECT created_by AS id FROM bi_threads ORDER BY created_at DESC LIMIT 1)
--      INSERT INTO bi_query_log (org_id, profile_id, source, question, answer_status)
--      SELECT o.id, p.id, s, '__verify__', 'answered'
--        FROM o, p, unnest(ARRAY['web','line','dashboard']) AS s;   -- ต้องผ่านทั้ง 3 แถว
--
--      -- ค่านอกเซ็ตต้องพัง (คาดหวัง ERROR … violates check constraint)
--      -- INSERT INTO bi_query_log (org_id, profile_id, source, question, answer_status)
--      --   SELECT id, NULL, 'bogus', 'x', 'answered' FROM organizations LIMIT 1;
--    ROLLBACK;
--
--    BEGIN;
--      WITH t AS (SELECT id, org_id FROM bi_threads ORDER BY created_at DESC LIMIT 1)
--      INSERT INTO bi_messages (org_id, thread_id, role, content, source)
--      SELECT t.org_id, t.id, 'user', '__verify__', s
--        FROM t, unnest(ARRAY['web','line','dashboard']) AS s;      -- ต้องผ่านทั้ง 3 แถว
--    ROLLBACK;
--
-- 2) นิยาม CHECK ปัจจุบัน (ต้องเห็น 'web','line','dashboard' ครบทั้ง 2 ตัว):
--    SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
--      FROM pg_constraint
--     WHERE conname IN ('bi_query_log_source_chk','bi_messages_source_chk');
--
-- 3) ACL ของ RPC ใหม่ต้องเหลือแค่ postgres|service_role (ห้ามมี anon/authenticated):
--    SELECT proname, proacl FROM pg_proc WHERE proname = 'incr_bi_dashboard_usage';
--
-- 4) คอลัมน์ใหม่มีจริง:
--    SELECT table_name, column_name, data_type, column_default, is_nullable
--      FROM information_schema.columns
--     WHERE (table_name, column_name) IN
--           (('bi_usage_daily','dashboard_count'), ('bi_dashboard_items','updated_at'));
--
-- 5) โควตาแยกกันจริง (การ์ดไม่กินโควตาคำถาม — R6):
--    SELECT public.incr_bi_dashboard_usage(:org, :profile, 200);
--    SELECT count, dashboard_count FROM bi_usage_daily
--     WHERE org_id = :org AND profile_id = :profile AND day = CURRENT_DATE;
--    -- คาดหวัง: count เท่าเดิม · dashboard_count +1
-- ===========================================================================
