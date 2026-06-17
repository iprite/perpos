-- Meeting Bot — goodwill refund (Phase 2.5)
-- เคส: บอทอัดจบ + settle (หัก bot_quota) ไปแล้ว แต่ worker ถอด/ดึง media ล้มเหลว "ถาวร"
--   → ผู้ใช้ไม่ได้ MoM → คืนยอดที่ settle ไปแล้ว (goodwill). idempotent ต่อ job.
-- ต่างจาก refund_bot_quota (คืน hold ก่อน settle) — ตัวนี้กลับรายการ settle ที่เกิดแล้ว
CREATE OR REPLACE FUNCTION public.refund_bot_settled(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_settled int;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind = 'refund') THEN
    RETURN false;  -- เคยคืนแล้ว
  END IF;
  SELECT profile_id, duration_seconds INTO v_profile, v_settled
    FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind = 'settle' LIMIT 1;
  IF v_profile IS NULL OR v_settled IS NULL OR v_settled <= 0 THEN RETURN false; END IF;  -- ยังไม่ settle → ใช้ refund_bot_quota แทน
  UPDATE public.bot_quota SET used_seconds = GREATEST(0, used_seconds - v_settled), updated_at = now()
    WHERE profile_id = v_profile;
  INSERT INTO public.bot_usage_transactions(profile_id, job_id, kind, duration_seconds, source)
    VALUES (v_profile, p_job_id, 'refund', v_settled, 'recall-goodwill');
  RETURN true;
END; $$;

REVOKE ALL     ON FUNCTION public.refund_bot_settled(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_bot_settled(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_bot_settled(uuid) TO service_role;
