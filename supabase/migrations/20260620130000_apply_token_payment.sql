-- ── T3: apply_token_payment — บันทึกการจ่าย + เติม token แบบ atomic + idempotent ──
-- ใช้จาก stripe webhook (manual pack + auto top-up) · idempotent ด้วย payment_intent
--   1 PI = 1 token_payments(succeeded) → token_grant 1 lot (amount_paid = บาทจริง = ฐาน revenue)

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_token_payment(
  p_profile_id    uuid,
  p_pack_code     text,
  p_tokens        bigint,
  p_amount        numeric,
  p_currency      text,
  p_payment_intent text,
  p_event_id      text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing uuid; v_payment_id uuid; v_grant jsonb;
BEGIN
  IF p_profile_id IS NULL OR p_tokens IS NULL OR p_tokens <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- idempotency: PI นี้บันทึก succeeded แล้ว → คืนของเดิม (กัน webhook ส่งซ้ำ/หลาย event)
  IF p_payment_intent IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.token_payments
     WHERE stripe_payment_intent_id = p_payment_intent AND status = 'succeeded' LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'payment_id', v_existing);
    END IF;
  END IF;

  INSERT INTO public.token_payments
    (profile_id, pack_code, tokens, amount, currency, status, stripe_payment_intent_id, stripe_event_id)
  VALUES
    (p_profile_id, p_pack_code, p_tokens, COALESCE(p_amount, 0), COALESCE(p_currency, 'THB'),
     'succeeded', p_payment_intent, p_event_id)
  RETURNING id INTO v_payment_id;

  -- เติม token (token_grant จัดการ rollover + ledger + balance ในตัว)
  v_grant := public.token_grant(p_profile_id, p_tokens, COALESCE(p_amount, 0), 'topup', v_payment_id, COALESCE(p_currency, 'THB'));

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'payment_id', v_payment_id, 'grant', v_grant);
END; $$;

REVOKE ALL ON FUNCTION public.apply_token_payment(uuid, text, bigint, numeric, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_token_payment(uuid, text, bigint, numeric, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_token_payment(uuid, text, bigint, numeric, text, text, text) TO service_role;

NOTIFY pgrst, 'reload config';
COMMIT;
