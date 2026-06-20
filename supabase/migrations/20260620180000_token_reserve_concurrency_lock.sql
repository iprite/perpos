-- Fix: token_reserve idempotency (job_id) ให้ปลอดภัยระดับ concurrency
--
-- ปัญหาเดิม: dedup เป็น read-then-write (SELECT SUM(debit) WHERE job_id) ก่อนเข้า
--   _token_debit_fifo (ที่ค่อย FOR UPDATE token_accounts) → 2 reserve ของ job เดียวกัน
--   ที่วิ่งพร้อมกันจะผ่าน dedup ทั้งคู่ (เห็น 0) → debit ซ้ำ = หักโทเคน 2 เท่า
-- token_ledger ใส่ UNIQUE(job_id) ไม่ได้ เพราะ FIFO สร้าง debit ได้หลายแถวต่อ job (หลาย lot)
-- จึงใช้ pg_advisory_xact_lock ต่อ job เพื่อ serialize: reserve#2 รอจน #1 commit
--   แล้ว dedup จะเห็น debit ของ #1 → คืน duplicate (ไม่หักซ้ำ)
--
-- ยืนยัน: sequential idempotency/over-reserve ไม่ regress (verify ผ่าน rollback test)
CREATE OR REPLACE FUNCTION public.token_reserve(p_profile_id uuid, p_job_id uuid, p_service text, p_units numeric, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rate numeric; v_tokens bigint; v_prior bigint; v_balance bigint;
BEGIN
  IF p_service NOT IN ('stt','bot','pdf') THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_service'); END IF;
  IF p_job_id IS NOT NULL THEN
    -- serialize reserves ของ job เดียวกัน (กัน concurrent double-debit)
    PERFORM pg_advisory_xact_lock(hashtext('token_reserve:' || p_job_id::text));
    SELECT COALESCE(SUM(-tokens), 0) INTO v_prior FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'debit';
    IF v_prior > 0 THEN
      SELECT balance_tokens INTO v_balance FROM public.token_accounts WHERE profile_id = p_profile_id;
      RETURN jsonb_build_object('ok', true, 'tokens_charged', v_prior, 'balance_after', COALESCE(v_balance,0), 'duplicate', true);
    END IF;
  END IF;
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = p_service;
  IF v_rate IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_rate'); END IF;
  v_tokens := CEIL(COALESCE(p_units,0) * v_rate)::bigint;
  RETURN public._token_debit_fifo(p_profile_id, p_job_id, p_service, v_tokens, p_source);
END; $function$;
