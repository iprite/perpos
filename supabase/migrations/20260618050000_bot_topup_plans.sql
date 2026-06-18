-- ผู้ช่วย AI — ขายแพ็กบอทประชุม (top-up เติมนาที bot_quota)
--   เพิ่มมิติ meter ('stt'|'bot') ให้ catalog/ledger · บอท = topup อย่างเดียว (ไม่มี subscription แยก)
--   apply_stt_payment generalize: meter='bot' → เติม bot_quota.limit_seconds

ALTER TABLE public.stt_plans
  ADD COLUMN IF NOT EXISTS meter text NOT NULL DEFAULT 'stt' CHECK (meter IN ('stt', 'bot'));
ALTER TABLE public.stt_payments
  ADD COLUMN IF NOT EXISTS meter text NOT NULL DEFAULT 'stt';

-- generalize: เพิ่ม p_meter (default 'stt' → backward-compat). ต้อง DROP เพราะเปลี่ยนจำนวน arg
DROP FUNCTION IF EXISTS public.apply_stt_payment(uuid, uuid, text, numeric, text, int, text, text, text, text);
CREATE OR REPLACE FUNCTION public.apply_stt_payment(
  p_profile_id uuid, p_plan_id uuid, p_kind text, p_amount numeric, p_currency text,
  p_minutes int, p_status text, p_payment_intent text, p_invoice text, p_event_id text,
  p_meter text DEFAULT 'stt'
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
     stripe_payment_intent_id, stripe_invoice_id, stripe_event_id, meter)
  VALUES
    (p_profile_id, p_plan_id, p_kind, COALESCE(p_amount, 0), COALESCE(p_currency, 'THB'),
     CASE WHEN p_status = 'succeeded' THEN GREATEST(0, COALESCE(p_minutes, 0)) ELSE 0 END,
     COALESCE(p_status, 'succeeded'), p_payment_intent, p_invoice, p_event_id, COALESCE(p_meter, 'stt'))
  RETURNING id INTO v_payment_id;

  IF COALESCE(p_status, 'succeeded') = 'succeeded' AND v_sec > 0 THEN
    IF p_meter = 'bot' THEN
      -- บอท = topup เท่านั้น: เติม limit_seconds (สะสม)
      INSERT INTO public.bot_quota(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
      UPDATE public.bot_quota SET limit_seconds = limit_seconds + v_sec, updated_at = now() WHERE profile_id = p_profile_id;
    ELSE
      INSERT INTO public.stt_quota(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
      IF p_kind = 'topup' THEN
        UPDATE public.stt_quota
           SET topup_seconds = topup_seconds + v_sec, limit_seconds = limit_seconds + v_sec, updated_at = now()
         WHERE profile_id = p_profile_id;
      ELSE
        UPDATE public.stt_quota
           SET plan_seconds = v_sec, used_seconds = 0, limit_seconds = v_sec + topup_seconds, updated_at = now()
         WHERE profile_id = p_profile_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'duplicate', false);
END; $$;

REVOKE ALL ON FUNCTION public.apply_stt_payment(uuid, uuid, text, numeric, text, int, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stt_payment(uuid, uuid, text, numeric, text, int, text, text, text, text, text) TO service_role;

-- seed แพ็กบอทประชุม (topup) — ราคาแสดง = ราคาเก็บจริง (checkout ใช้ price_data inline)
INSERT INTO public.stt_plans (code, name, kind, meter, minutes, price, currency, sort_order, is_active)
VALUES
  ('bot_topup_60',  'บอทประชุม 60 นาที',  'topup', 'bot', 60,  99,  'THB', 110, true),
  ('bot_topup_180', 'บอทประชุม 180 นาที', 'topup', 'bot', 180, 259, 'THB', 120, true),
  ('bot_topup_300', 'บอทประชุม 300 นาที', 'topup', 'bot', 300, 390, 'THB', 130, true)
ON CONFLICT (code) DO NOTHING;
