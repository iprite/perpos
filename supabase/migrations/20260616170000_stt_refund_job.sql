-- คืนโควต้าแบบผูกกับ job + idempotent — กันโควต้ารั่วเมื่อ worker ถูก kill กลางคัน
-- (catch ไม่ทำงาน) แล้ว scheduler stuck-sweep มา fail job ทีหลัง ก็เรียกตัวนี้คืนได้
-- ปลอดภัยถ้าเรียกซ้ำ (เช็คว่ามี refund ของ job นี้แล้วหรือยัง)
CREATE OR REPLACE FUNCTION public.refund_stt_job(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_seconds int;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  -- idempotent: ถ้าเคยคืนแล้วไม่ทำซ้ำ
  IF EXISTS (SELECT 1 FROM public.stt_usage_transactions WHERE job_id = p_job_id AND kind = 'refund') THEN
    RETURN false;
  END IF;
  -- หา debit ของ job นี้ (ถ้าไม่มี = ยังไม่เคยจอง → ไม่ต้องคืน)
  SELECT profile_id, duration_seconds INTO v_profile, v_seconds
    FROM public.stt_usage_transactions WHERE job_id = p_job_id AND kind = 'debit' LIMIT 1;
  IF v_profile IS NULL OR v_seconds IS NULL OR v_seconds <= 0 THEN RETURN false; END IF;

  UPDATE public.stt_quota SET used_seconds = GREATEST(0, used_seconds - v_seconds), updated_at = now()
    WHERE profile_id = v_profile;
  INSERT INTO public.stt_usage_transactions(profile_id, job_id, kind, duration_seconds, source)
    VALUES (v_profile, p_job_id, 'refund', v_seconds, 'auto-refund');
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.refund_stt_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_stt_job(uuid) TO service_role;
