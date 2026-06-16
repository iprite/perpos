-- Quota ระบบแกะเสียง — จำกัดตาม "วินาทีการประชุม" ต่อคน (default 300 นาที = 18000 วิ)
--   1. stt_quota (per profile) — limit/used วินาที (admin ปรับ limit ได้)
--   2. stt_usage_transactions — ledger ทุก debit/refund
--   3. transcription_jobs.duration_seconds
--   4. RPC consume_stt_quota (atomic reserve) + refund_stt_quota — service role เท่านั้น

-- 1. stt_quota
CREATE TABLE IF NOT EXISTS public.stt_quota (
  profile_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  limit_seconds int NOT NULL DEFAULT 18000,
  used_seconds  int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stt_quota ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stt_quota_select_own ON public.stt_quota;
CREATE POLICY stt_quota_select_own ON public.stt_quota
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- 2. ledger
CREATE TABLE IF NOT EXISTS public.stt_usage_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id           uuid REFERENCES public.transcription_jobs(id) ON DELETE SET NULL,
  kind             text NOT NULL CHECK (kind IN ('debit', 'refund')),
  duration_seconds int NOT NULL,
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stt_usage_profile ON public.stt_usage_transactions (profile_id, created_at DESC);
ALTER TABLE public.stt_usage_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stt_usage_select_own ON public.stt_usage_transactions;
CREATE POLICY stt_usage_select_own ON public.stt_usage_transactions
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- 3. duration column
ALTER TABLE public.transcription_jobs ADD COLUMN IF NOT EXISTS duration_seconds int;

-- 4a. consume (atomic reserve)
CREATE OR REPLACE FUNCTION public.consume_stt_quota(p_profile_id uuid, p_seconds int, p_job_id uuid, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit int; v_used int; v_remaining int;
BEGIN
  IF p_seconds IS NULL OR p_seconds < 0 THEN p_seconds := 0; END IF;
  INSERT INTO public.stt_quota(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
  SELECT limit_seconds, used_seconds INTO v_limit, v_used
    FROM public.stt_quota WHERE profile_id = p_profile_id FOR UPDATE;
  v_remaining := v_limit - v_used;
  IF p_seconds > v_remaining THEN
    RETURN jsonb_build_object('ok', false, 'remaining_seconds', v_remaining, 'limit_seconds', v_limit, 'used_seconds', v_used);
  END IF;
  UPDATE public.stt_quota SET used_seconds = used_seconds + p_seconds, updated_at = now() WHERE profile_id = p_profile_id;
  INSERT INTO public.stt_usage_transactions(profile_id, job_id, kind, duration_seconds, source)
    VALUES (p_profile_id, p_job_id, 'debit', p_seconds, p_source);
  RETURN jsonb_build_object('ok', true, 'remaining_seconds', v_remaining - p_seconds, 'limit_seconds', v_limit, 'used_seconds', v_used + p_seconds);
END; $$;

-- 4b. refund
CREATE OR REPLACE FUNCTION public.refund_stt_quota(p_profile_id uuid, p_seconds int, p_job_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_seconds IS NULL OR p_seconds <= 0 THEN RETURN; END IF;
  UPDATE public.stt_quota SET used_seconds = GREATEST(0, used_seconds - p_seconds), updated_at = now() WHERE profile_id = p_profile_id;
  INSERT INTO public.stt_usage_transactions(profile_id, job_id, kind, duration_seconds, source)
    VALUES (p_profile_id, p_job_id, 'refund', p_seconds, 'refund');
END; $$;

-- ความปลอดภัย: RPC เรียกได้เฉพาะ service role (กัน user ยิงผ่าน PostgREST เพื่อเติม/คืนโควต้าเอง)
REVOKE ALL ON FUNCTION public.consume_stt_quota(uuid, int, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_stt_quota(uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stt_quota(uuid, int, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_stt_quota(uuid, int, uuid) TO service_role;
