-- ── T2: ชิม RPC quota เดิม → token ledger ──────────────────────────────────────
-- เปลี่ยน "ไส้ใน" ของ RPC quota เดิมทั้ง 9 ตัวให้หัก/คืนจาก token ledger แทนตาราง
-- *_quota เดิม โดย "คงลายเซ็น + รูปแบบ return เดิม" → worker/route ไม่ต้องแก้ call site
--   (โดยเฉพาะ bot lifecycle hold→settle→extend→goodwill ที่ idempotency ซับซ้อน)
--
-- หน่วย: shim แปลง วินาที/หน้า ⇄ token ผ่าน token_rates · remaining_* ที่คืน = ยอด
--   token ที่เหลือหารด้วย rate (unified pool — ทุก service กินกระเป๋าเดียวกัน)
--
-- หมายเหตุ: ตาราง stt_quota/bot_quota/pdf_quota + *_usage_transactions เดิม "เลิกใช้"
--   หลัง migration นี้ (ไม่ลบทิ้งใน T2 — เก็บไว้ก่อนเผื่อ rollback, ลบใน cleanup ภายหลัง)

BEGIN;

-- ── 0. internal: FIFO debit (ไม่มี idempotency guard) — ใช้ร่วม reserve/extend/hold ─
CREATE OR REPLACE FUNCTION public._token_debit_fifo(
  p_profile_id uuid, p_job_id uuid, p_service text, p_tokens bigint, p_source text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance bigint; v_lot record; v_take bigint; v_need bigint; v_rev_ratio numeric;
BEGIN
  IF p_tokens IS NULL OR p_tokens < 0 THEN p_tokens := 0; END IF;

  INSERT INTO public.token_accounts(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
  SELECT balance_tokens INTO v_balance FROM public.token_accounts WHERE profile_id = p_profile_id FOR UPDATE;

  -- เก็บกวาด lot หมดอายุที่ค้างก่อน · breakage = remaining × (amount_paid/granted) (trial=0)
  FOR v_lot IN
    SELECT id, remaining_tokens, granted_tokens, amount_paid FROM public.token_lots
     WHERE profile_id = p_profile_id AND status = 'active' AND expires_at < now() AND remaining_tokens > 0
     FOR UPDATE
  LOOP
    v_balance := v_balance - v_lot.remaining_tokens;
    v_rev_ratio := CASE WHEN v_lot.granted_tokens > 0 THEN v_lot.amount_paid / v_lot.granted_tokens ELSE 0 END;
    INSERT INTO public.token_ledger(profile_id, lot_id, kind, tokens, balance_after, revenue_thb, reason)
    VALUES (p_profile_id, v_lot.id, 'expire', -v_lot.remaining_tokens, v_balance, v_lot.remaining_tokens * v_rev_ratio, 'expired');
    UPDATE public.token_lots SET remaining_tokens = 0, status = 'expired' WHERE id = v_lot.id;
  END LOOP;

  IF p_tokens > v_balance THEN
    RETURN jsonb_build_object('ok', false, 'balance', v_balance, 'needed', p_tokens);
  END IF;
  IF p_tokens = 0 THEN
    RETURN jsonb_build_object('ok', true, 'tokens_charged', 0, 'balance_after', v_balance);
  END IF;

  v_need := p_tokens;
  FOR v_lot IN
    SELECT id, remaining_tokens, granted_tokens, amount_paid FROM public.token_lots
     WHERE profile_id = p_profile_id AND status = 'active' AND remaining_tokens > 0 AND expires_at >= now()
     ORDER BY expires_at ASC, granted_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_need, v_lot.remaining_tokens);
    v_balance := v_balance - v_take;
    v_rev_ratio := CASE WHEN v_lot.granted_tokens > 0 THEN v_lot.amount_paid / v_lot.granted_tokens ELSE 0 END;
    INSERT INTO public.token_ledger(profile_id, lot_id, job_id, kind, service, tokens, balance_after, revenue_thb, reason)
    VALUES (p_profile_id, v_lot.id, p_job_id, 'debit', p_service, -v_take, v_balance, v_take * v_rev_ratio, p_source);
    UPDATE public.token_lots
       SET remaining_tokens = remaining_tokens - v_take,
           status = CASE WHEN remaining_tokens - v_take = 0 THEN 'exhausted' ELSE status END
     WHERE id = v_lot.id;
    v_need := v_need - v_take;
  END LOOP;

  UPDATE public.token_accounts
     SET balance_tokens = v_balance, lifetime_spent = lifetime_spent + p_tokens, updated_at = now()
   WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object('ok', true, 'tokens_charged', p_tokens, 'balance_after', v_balance);
END; $$;
REVOKE ALL ON FUNCTION public._token_debit_fifo(uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._token_debit_fifo(uuid, uuid, text, bigint, text) TO service_role;

-- ── 0b. token_reserve ใช้ helper ภายใน (idempotency + แปลง rate) ────────────────
CREATE OR REPLACE FUNCTION public.token_reserve(
  p_profile_id uuid, p_job_id uuid, p_service text, p_units numeric, p_source text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric; v_tokens bigint; v_prior bigint; v_balance bigint;
BEGIN
  IF p_service NOT IN ('stt','bot','pdf') THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_service'); END IF;
  IF p_job_id IS NOT NULL THEN
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
END; $$;

-- ╔══ STT shims ══════════════════════════════════════════════════════════════╗
CREATE OR REPLACE FUNCTION public.consume_stt_quota(p_profile_id uuid, p_seconds int, p_job_id uuid, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric; r jsonb; v_remain int;
BEGIN
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = 'stt';
  r := public.token_reserve(p_profile_id, p_job_id, 'stt', GREATEST(0, COALESCE(p_seconds,0)), p_source);
  IF (r->>'ok')::boolean THEN
    v_remain := FLOOR((r->>'balance_after')::numeric / NULLIF(v_rate,0));
    RETURN jsonb_build_object('ok', true, 'remaining_seconds', v_remain, 'limit_seconds', v_remain, 'used_seconds', 0);
  END IF;
  v_remain := FLOOR(COALESCE((r->>'balance')::numeric,0) / NULLIF(v_rate,0));
  RETURN jsonb_build_object('ok', false, 'remaining_seconds', v_remain, 'limit_seconds', v_remain, 'used_seconds', 0);
END; $$;

CREATE OR REPLACE FUNCTION public.refund_stt_quota(p_profile_id uuid, p_seconds int, p_job_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric;
BEGIN
  IF p_seconds IS NULL OR p_seconds <= 0 THEN RETURN; END IF;
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = 'stt';
  PERFORM public.token_refund(p_job_id, CEIL(p_seconds * v_rate)::bigint);
END; $$;

CREATE OR REPLACE FUNCTION public.refund_stt_job(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  r := public.token_refund(p_job_id, NULL);
  RETURN COALESCE((r->>'tokens_refunded')::bigint, 0) > 0;
END; $$;

-- ╔══ PDF shims ══════════════════════════════════════════════════════════════╗
CREATE OR REPLACE FUNCTION public.consume_pdf_quota(p_profile_id uuid, p_pages int, p_job_id uuid, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric; r jsonb; v_remain int;
BEGIN
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = 'pdf';
  r := public.token_reserve(p_profile_id, p_job_id, 'pdf', GREATEST(0, COALESCE(p_pages,0)), p_source);
  IF (r->>'ok')::boolean THEN
    v_remain := FLOOR((r->>'balance_after')::numeric / NULLIF(v_rate,0));
    RETURN jsonb_build_object('ok', true, 'remaining_pages', v_remain, 'limit_pages', v_remain, 'used_pages', 0);
  END IF;
  v_remain := FLOOR(COALESCE((r->>'balance')::numeric,0) / NULLIF(v_rate,0));
  RETURN jsonb_build_object('ok', false, 'remaining_pages', v_remain, 'limit_pages', v_remain, 'used_pages', 0);
END; $$;

CREATE OR REPLACE FUNCTION public.refund_pdf_quota(p_profile_id uuid, p_pages int, p_job_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric;
BEGIN
  IF p_pages IS NULL OR p_pages <= 0 THEN RETURN; END IF;
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = 'pdf';
  PERFORM public.token_refund(p_job_id, CEIL(p_pages * v_rate)::bigint);
END; $$;

CREATE OR REPLACE FUNCTION public.refund_pdf_job(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  r := public.token_refund(p_job_id, NULL);
  RETURN COALESCE((r->>'tokens_refunded')::bigint, 0) > 0;
END; $$;

-- ╔══ BOT shims (hold→settle→extend→refund→goodwill) ═════════════════════════╗
-- marker: settle ใส่ ledger 'adjust' tokens=0 reason='bot-settled' → ใช้แยกสถานะ
CREATE OR REPLACE FUNCTION public.hold_bot_quota(p_profile_id uuid, p_seconds int, p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric; r jsonb; v_remain int;
BEGIN
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = 'bot';
  r := public.token_reserve(p_profile_id, p_job_id, 'bot', GREATEST(0, COALESCE(p_seconds,0)), 'recall-hold');
  IF (r->>'ok')::boolean THEN
    v_remain := FLOOR((r->>'balance_after')::numeric / NULLIF(v_rate,0));
    RETURN jsonb_build_object('ok', true, 'remaining_seconds', v_remain, 'limit_seconds', v_remain);
  END IF;
  v_remain := FLOOR(COALESCE((r->>'balance')::numeric,0) / NULLIF(v_rate,0));
  RETURN jsonb_build_object('ok', false, 'remaining_seconds', v_remain, 'limit_seconds', v_remain);
END; $$;

CREATE OR REPLACE FUNCTION public.settle_bot_quota(p_job_id uuid, p_actual_seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_rate numeric; v_net bigint; v_actual bigint; v_bal bigint;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  -- idempotent: เคย settle แล้ว
  IF EXISTS (SELECT 1 FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'adjust' AND reason = 'bot-settled') THEN
    RETURN false;
  END IF;
  SELECT profile_id INTO v_profile FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'debit' LIMIT 1;
  IF v_profile IS NULL THEN RETURN false; END IF;   -- ไม่เคย hold
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = 'bot';
  v_actual := CEIL(GREATEST(0, COALESCE(p_actual_seconds,0)) * v_rate)::bigint;
  -- net token ที่ถูกหักอยู่ตอนนี้ (hold + extend − refund)
  SELECT COALESCE(SUM(-tokens),0) - COALESCE((SELECT SUM(tokens) FROM public.token_ledger WHERE job_id=p_job_id AND kind='refund'),0)
    INTO v_net FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'debit';
  IF v_net > v_actual THEN
    PERFORM public.token_refund(p_job_id, v_net - v_actual);
  END IF;
  SELECT balance_tokens INTO v_bal FROM public.token_accounts WHERE profile_id = v_profile;
  INSERT INTO public.token_ledger(profile_id, job_id, kind, tokens, balance_after, reason)
  VALUES (v_profile, p_job_id, 'adjust', 0, COALESCE(v_bal,0), 'bot-settled');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.extend_bot_hold(p_job_id uuid, p_extra_seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_rate numeric; r jsonb;
BEGIN
  IF p_job_id IS NULL OR p_extra_seconds IS NULL OR p_extra_seconds <= 0 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'adjust' AND reason = 'bot-settled') THEN
    RETURN false;  -- settle แล้วขยายไม่ได้
  END IF;
  SELECT profile_id INTO v_profile FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'debit' LIMIT 1;
  IF v_profile IS NULL THEN RETURN false; END IF;
  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = 'bot';
  r := public._token_debit_fifo(v_profile, p_job_id, 'bot', CEIL(p_extra_seconds * v_rate)::bigint, 'recall-extend');
  RETURN COALESCE((r->>'ok')::boolean, false);
END; $$;

CREATE OR REPLACE FUNCTION public.refund_bot_quota(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  -- settle หรือ refund ไปแล้ว → ไม่คืน hold (ของจริงคิดเงินไปแล้ว)
  IF EXISTS (SELECT 1 FROM public.token_ledger WHERE job_id = p_job_id
              AND ((kind = 'adjust' AND reason = 'bot-settled') OR kind = 'refund')) THEN
    RETURN false;
  END IF;
  r := public.token_refund(p_job_id, NULL);
  RETURN COALESCE((r->>'tokens_refunded')::bigint, 0) > 0;
END; $$;

CREATE OR REPLACE FUNCTION public.refund_bot_settled(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_profile uuid; v_bal bigint;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  -- ต้อง settle แล้วเท่านั้น (goodwill หลังคิดเงิน)
  IF NOT EXISTS (SELECT 1 FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'adjust' AND reason = 'bot-settled') THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'adjust' AND reason = 'bot-goodwill') THEN
    RETURN false;  -- เคยคืน goodwill แล้ว
  END IF;
  SELECT profile_id INTO v_profile FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'debit' LIMIT 1;
  r := public.token_refund(p_job_id, NULL);
  SELECT balance_tokens INTO v_bal FROM public.token_accounts WHERE profile_id = v_profile;
  INSERT INTO public.token_ledger(profile_id, job_id, kind, tokens, balance_after, reason)
  VALUES (v_profile, p_job_id, 'adjust', 0, COALESCE(v_bal,0), 'bot-goodwill');
  RETURN COALESCE((r->>'tokens_refunded')::bigint, 0) > 0;
END; $$;

COMMIT;
