-- FIX (accounting bug ใน apply_stt_payment): subscription renewal คืน topup ที่ใช้ไปแล้วฟรี
--   เดิม reset used=0 + คง topup_seconds ทั้งก้อนใน limit → นาที topup ที่บริโภคไปแล้วกลับมาฟรี
--   แก้: carry over เฉพาะ topup ที่ "ยังไม่ใช้" — convention ใช้ plan ก่อน แล้วค่อย topup
--        remaining_topup = topup_seconds − max(0, used_seconds − plan_seconds)
--   (RHS ทุกตัวใน UPDATE อ้างค่าเดิมของแถวตาม Postgres semantics → คำนวณตรงกันทั้ง topup_seconds และ limit_seconds)

CREATE OR REPLACE FUNCTION public.apply_stt_payment(
  p_profile_id uuid, p_plan_id uuid, p_kind text, p_amount numeric, p_currency text,
  p_minutes int, p_status text, p_payment_intent text, p_invoice text, p_event_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing uuid; v_payment_id uuid; v_sec int := GREATEST(0, COALESCE(p_minutes, 0)) * 60;
BEGIN
  SELECT id INTO v_existing FROM public.stt_payments
   WHERE (p_invoice IS NOT NULL AND stripe_invoice_id = p_invoice)
      OR (p_payment_intent IS NOT NULL AND stripe_payment_intent_id = p_payment_intent)
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'payment_id', v_existing, 'duplicate', true);
  END IF;

  INSERT INTO public.stt_payments
    (profile_id, plan_id, kind, amount, currency, minutes_granted, status,
     stripe_payment_intent_id, stripe_invoice_id, stripe_event_id)
  VALUES
    (p_profile_id, p_plan_id, p_kind, COALESCE(p_amount, 0), COALESCE(p_currency, 'THB'),
     CASE WHEN p_status = 'succeeded' THEN GREATEST(0, COALESCE(p_minutes, 0)) ELSE 0 END,
     COALESCE(p_status, 'succeeded'), p_payment_intent, p_invoice, p_event_id)
  RETURNING id INTO v_payment_id;

  IF COALESCE(p_status, 'succeeded') = 'succeeded' AND v_sec > 0 THEN
    INSERT INTO public.stt_quota(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
    IF p_kind = 'topup' THEN
      UPDATE public.stt_quota
         SET topup_seconds = topup_seconds + v_sec, limit_seconds = limit_seconds + v_sec, updated_at = now()
       WHERE profile_id = p_profile_id;
    ELSE
      UPDATE public.stt_quota
         SET topup_seconds = GREATEST(0, topup_seconds - GREATEST(0, used_seconds - plan_seconds)),
             plan_seconds  = v_sec,
             used_seconds  = 0,
             limit_seconds = v_sec + GREATEST(0, topup_seconds - GREATEST(0, used_seconds - plan_seconds)),
             updated_at = now()
       WHERE profile_id = p_profile_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'duplicate', false);
END; $$;

REVOKE ALL ON FUNCTION public.apply_stt_payment(uuid, uuid, text, numeric, text, int, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stt_payment(uuid, uuid, text, numeric, text, int, text, text, text, text) TO service_role;
