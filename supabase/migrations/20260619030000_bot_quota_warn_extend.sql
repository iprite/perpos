-- =========================================================
-- Phase 1c — เตือนโควต้าบอทใกล้หมด (≥10 นาทีก่อน kick) + เติมแล้วต่อเวลาบอทได้
--   quota_warned_at = กันเตือนซ้ำ (reset เมื่อขยาย hold สำเร็จ)
--   extend_bot_hold = จองโควต้าที่เติมเข้ามาเพิ่มเข้า hold เดิม + บั๊มป์ ledger ให้ settle/refund ยังถูก
-- =========================================================
ALTER TABLE public.assistant_jobs
  ADD COLUMN IF NOT EXISTS quota_warned_at timestamptz;

-- ขยาย hold ของ bot job (เมื่อผู้ใช้เติมโควต้าระหว่างประชุม) — atomic, service-role only
-- used += extra (จองเพิ่ม) + อัปเดต duration ของแถว 'hold' เดิม (settle ใช้ used := used - hold + actual จึงต้องตรงกัน)
CREATE OR REPLACE FUNCTION public.extend_bot_hold(p_job_id uuid, p_extra_seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid;
BEGIN
  IF p_job_id IS NULL OR p_extra_seconds IS NULL OR p_extra_seconds <= 0 THEN RETURN false; END IF;
  -- finalize แล้ว (settle/refund) → ห้ามขยาย
  IF EXISTS (SELECT 1 FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind IN ('settle','refund')) THEN
    RETURN false;
  END IF;
  SELECT profile_id INTO v_profile FROM public.bot_usage_transactions WHERE job_id = p_job_id AND kind = 'hold' LIMIT 1;
  IF v_profile IS NULL THEN RETURN false; END IF;       -- ไม่เคย hold = ไม่มีอะไรให้ขยาย
  UPDATE public.bot_quota SET used_seconds = used_seconds + p_extra_seconds, updated_at = now()
    WHERE profile_id = v_profile;
  UPDATE public.bot_usage_transactions SET duration_seconds = duration_seconds + p_extra_seconds
    WHERE job_id = p_job_id AND kind = 'hold';
  RETURN true;
END; $$;

REVOKE ALL     ON FUNCTION public.extend_bot_hold(uuid, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_bot_hold(uuid, int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.extend_bot_hold(uuid, int) TO service_role;
