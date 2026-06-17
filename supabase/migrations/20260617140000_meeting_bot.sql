-- Meeting Bot (Recall.ai) — Phase 2.0
-- ต่อยอด assistant_jobs + เพิ่มมิเตอร์ที่ 2 (bot_quota) สำหรับช่องทาง "บอทเข้าประชุม"
--   · อัปไฟล์เอง /mom → stt_quota (เดิม) · ประชุมผ่านบอท → bot_quota (วินาทีที่ Recall คิดเงินจริง)
--   · ไม่สร้าง user/job ชุดใหม่ — extend ของเดิมทั้งหมด
-- อ้างอิงดีไซน์: docs perpos-recall-integration-plan-v2.md §3

-- =========================================================
-- 1) assistant_jobs — ขยาย source CHECK + เพิ่มฟิลด์ของบอท
--    constraint เดิมชื่อ transcription_jobs_source_check (verify แล้วจาก pg_constraint)
-- =========================================================
ALTER TABLE public.assistant_jobs
  DROP CONSTRAINT IF EXISTS transcription_jobs_source_check;
ALTER TABLE public.assistant_jobs
  ADD CONSTRAINT assistant_jobs_source_check
  CHECK (source IN ('web', 'line', 'recall', 'calendar'));

ALTER TABLE public.assistant_jobs
  ADD COLUMN IF NOT EXISTS meeting_url          text,
  ADD COLUMN IF NOT EXISTS join_at              timestamptz,   -- null = ad-hoc (เข้าทันที)
  ADD COLUMN IF NOT EXISTS recall_bot_id        text,
  ADD COLUMN IF NOT EXISTS bot_state            text,          -- mirror lifecycle Recall (scheduled/joining/recording/recording_ready/cancelled/…)
  ADD COLUMN IF NOT EXISTS last_sub_code        text,
  ADD COLUMN IF NOT EXISTS dedup_key            text,
  ADD COLUMN IF NOT EXISTS recording_url        text,          -- Recall media URL (worker ดึงเอง)
  ADD COLUMN IF NOT EXISTS joined_at            timestamptz,   -- bot.joining_call → ฐานเวลาที่ Recall เริ่มคิดเงิน
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz,   -- bot.in_call_recording
  ADD COLUMN IF NOT EXISTS hold_seconds         int NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_jobs_recall_bot
  ON public.assistant_jobs (recall_bot_id) WHERE recall_bot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_jobs_dedup
  ON public.assistant_jobs (dedup_key) WHERE dedup_key IS NOT NULL;

-- หมายเหตุ: audio_url เดิม nullable อยู่แล้ว (source='line' ก็เป็น null จนกว่า worker จะดึง)
--   → recall job สร้างด้วย audio_url=null, worker จะเติม path เมื่อดึง recording จาก recording_url
--   bot_state คุม lifecycle ช่วงรอบอท (status คง 'pending' จนกว่าจะพร้อมถอด — ดู scheduler 2.5)

-- =========================================================
-- 2) bot_quota — มิเตอร์ที่ 2 (วินาทีที่ Recall คิดเงิน) — มิเรอร์ stt_quota
-- =========================================================
CREATE TABLE IF NOT EXISTS public.bot_quota (
  profile_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  limit_seconds int NOT NULL DEFAULT 7200,   -- trial 120 นาที bot-time (admin ปรับได้)
  used_seconds  int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_quota ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_quota_select_own ON public.bot_quota;
CREATE POLICY bot_quota_select_own ON public.bot_quota
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.bot_usage_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id           uuid REFERENCES public.assistant_jobs(id) ON DELETE SET NULL,
  kind             text NOT NULL CHECK (kind IN ('hold', 'settle', 'refund')),
  duration_seconds int NOT NULL,             -- hold=จอง, settle=actual (Recall billed), refund=คืน
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_usage_profile ON public.bot_usage_transactions (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_usage_job     ON public.bot_usage_transactions (job_id);
ALTER TABLE public.bot_usage_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_usage_select_own ON public.bot_usage_transactions;
CREATE POLICY bot_usage_select_own ON public.bot_usage_transactions
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- =========================================================
-- 3) RPC: hold_bot_quota — จองก่อนส่งบอท (atomic, service-role only)
-- =========================================================
CREATE OR REPLACE FUNCTION public.hold_bot_quota(p_profile_id uuid, p_seconds int, p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit int; v_used int; v_remaining int;
BEGIN
  IF p_seconds IS NULL OR p_seconds < 0 THEN p_seconds := 0; END IF;
  INSERT INTO public.bot_quota(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
  SELECT limit_seconds, used_seconds INTO v_limit, v_used
    FROM public.bot_quota WHERE profile_id = p_profile_id FOR UPDATE;
  v_remaining := v_limit - v_used;
  IF p_seconds > v_remaining THEN
    RETURN jsonb_build_object('ok', false, 'remaining_seconds', v_remaining, 'limit_seconds', v_limit);
  END IF;
  UPDATE public.bot_quota SET used_seconds = used_seconds + p_seconds, updated_at = now() WHERE profile_id = p_profile_id;
  INSERT INTO public.bot_usage_transactions(profile_id, job_id, kind, duration_seconds, source)
    VALUES (p_profile_id, p_job_id, 'hold', p_seconds, 'recall-hold');
  RETURN jsonb_build_object('ok', true, 'remaining_seconds', v_remaining - p_seconds, 'limit_seconds', v_limit);
END; $$;

-- 4a) settle_bot_quota — ปรับ hold → actual (วินาทีที่ Recall คิดจริง) — idempotent ต่อ job
CREATE OR REPLACE FUNCTION public.settle_bot_quota(p_job_id uuid, p_actual_seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_hold int; v_actual int;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  v_actual := GREATEST(0, COALESCE(p_actual_seconds, 0));
  IF EXISTS (SELECT 1 FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind = 'settle') THEN
    RETURN false;  -- idempotent
  END IF;
  SELECT profile_id, duration_seconds INTO v_profile, v_hold
    FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind = 'hold' LIMIT 1;
  IF v_profile IS NULL THEN RETURN false; END IF;       -- ไม่เคย hold = ไม่ต้อง settle
  UPDATE public.bot_quota
     SET used_seconds = GREATEST(0, used_seconds - COALESCE(v_hold, 0) + v_actual), updated_at = now()
   WHERE profile_id = v_profile;
  INSERT INTO public.bot_usage_transactions(profile_id, job_id, kind, duration_seconds, source)
    VALUES (v_profile, p_job_id, 'settle', v_actual, 'recall-settle');
  RETURN true;
END; $$;

-- 4b) refund_bot_quota — บอท fatal/ยกเลิก (ไม่คิดเงิน) → คืน hold เต็ม — idempotent
CREATE OR REPLACE FUNCTION public.refund_bot_quota(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_hold int;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind IN ('settle','refund')) THEN
    RETURN false;
  END IF;
  SELECT profile_id, duration_seconds INTO v_profile, v_hold
    FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind = 'hold' LIMIT 1;
  IF v_profile IS NULL OR v_hold IS NULL OR v_hold <= 0 THEN RETURN false; END IF;
  UPDATE public.bot_quota SET used_seconds = GREATEST(0, used_seconds - v_hold), updated_at = now()
    WHERE profile_id = v_profile;
  INSERT INTO public.bot_usage_transactions(profile_id, job_id, kind, duration_seconds, source)
    VALUES (v_profile, p_job_id, 'refund', v_hold, 'recall-refund');
  RETURN true;
END; $$;

-- security — SECURITY DEFINER service-role-only (REVOKE anon+authenticated ตาม convention)
REVOKE ALL     ON FUNCTION public.hold_bot_quota(uuid, int, uuid)  FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.settle_bot_quota(uuid, int)      FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.refund_bot_quota(uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hold_bot_quota(uuid, int, uuid)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_bot_quota(uuid, int)      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_bot_quota(uuid)           FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.hold_bot_quota(uuid, int, uuid)  TO service_role;
GRANT  EXECUTE ON FUNCTION public.settle_bot_quota(uuid, int)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.refund_bot_quota(uuid)           TO service_role;

-- หมายเหตุ: stt_quota / consume_stt_quota เดิมไม่แตะ — ช่องทาง /mom ยังหัก stt ตามเดิม
--   stt-worker จะข้าม consume_stt_quota เมื่อ job.source='recall' (ทำใน Phase 2.4)

-- =========================================================
-- 5) webhook_event — idempotency log สำหรับ Recall webhook (Svix)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.webhook_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,                -- 'recall'
  svix_id       text UNIQUE,                  -- idempotency key
  event_type    text NOT NULL,
  recall_bot_id text,
  payload       jsonb NOT NULL,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_event_created ON public.webhook_event (created_at);
ALTER TABLE public.webhook_event ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy เปิด → authenticated เข้าไม่ได้; webhook ใช้ service role (bypass RLS)
