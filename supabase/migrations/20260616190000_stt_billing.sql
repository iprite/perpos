-- ── STT Billing (per-profile) ───────────────────────────────────────────────
-- ขายนาทีแกะเสียงเป็นรายคน (LINE-first individual) — แยกจาก org_billing เดิม (per-org/seat)
-- เชื่อม Stripe ที่มีอยู่: reuse `stripe_events` เป็น idempotency log ของ webhook
--
-- โมเดล:
--   stt_plans         catalog แพ็ก — subscription (รายเดือน, recurring price) + topup (เติมนาที, one-time)
--   stt_subscriptions per-profile sub ที่ active (mirror สถานะ Stripe)
--   stt_payments      ledger เงินเข้า (invoice ของ sub + topup) — 1 แถว/การจ่าย, idempotent
--   stt_quota         += plan_seconds (โควต้าเดือนปัจจุบัน, reset ทุกรอบ) + topup_seconds (เติมแล้วสะสม)
--
-- กฎ: เขียน/แก้ผ่าน service role (webhook) เท่านั้น · ผู้ใช้เห็นเฉพาะของตัวเอง · plans = catalog อ่านได้ทุกคน
BEGIN;

-- ── 0. ขยาย stt_quota: แยกโควต้าแผน (reset รายเดือน) ออกจาก topup (สะสม) ───────
ALTER TABLE public.stt_quota
  ADD COLUMN IF NOT EXISTS plan_seconds  int NOT NULL DEFAULT 0,  -- โควต้าจากแผนรอบปัจจุบัน
  ADD COLUMN IF NOT EXISTS topup_seconds int NOT NULL DEFAULT 0;  -- โควต้าเติม (carry over ข้ามรอบ)
COMMENT ON COLUMN public.stt_quota.plan_seconds  IS 'โควต้าจาก subscription รอบปัจจุบัน (reset ทุก renewal) — ส่วนหนึ่งของ limit_seconds';
COMMENT ON COLUMN public.stt_quota.topup_seconds IS 'โควต้าเติม (topup) สะสม ไม่ reset — ส่วนหนึ่งของ limit_seconds';

-- ── 1. stt_plans (catalog) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stt_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,              -- 'pro_monthly', 'topup_300' ...
  name            text NOT NULL,                     -- ชื่อแสดงผล
  kind            text NOT NULL CHECK (kind IN ('subscription', 'topup')),
  minutes         int  NOT NULL CHECK (minutes >= 0),-- นาทีที่ได้ (ต่อรอบ ถ้า sub / ครั้งเดียว ถ้า topup)
  price           numeric(12,2) NOT NULL DEFAULT 0,  -- ราคาแสดงผล (Stripe เป็นแหล่งจริงตอนเก็บเงิน)
  currency        text NOT NULL DEFAULT 'THB',
  stripe_price_id text UNIQUE,                        -- Stripe Price (recurring=sub / one-time=topup)
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stt_plans_active_idx ON public.stt_plans (is_active, sort_order) WHERE is_active;

ALTER TABLE public.stt_plans ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.stt_plans FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS stt_plans_select_active ON public.stt_plans;
CREATE POLICY stt_plans_select_active ON public.stt_plans
  FOR SELECT TO authenticated USING (is_active);   -- catalog อ่านได้ทุก user (เฉพาะที่เปิดขาย)

-- ── 2. stt_subscriptions (per-profile) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stt_subscriptions (
  profile_id             uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id                uuid REFERENCES public.stt_plans(id) ON DELETE SET NULL,
  stripe_customer_id     text,
  stripe_subscription_id text UNIQUE,
  status                 text,   -- mirror Stripe: trialing/active/past_due/canceled/incomplete/unpaid
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stt_subscriptions_customer_idx ON public.stt_subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stt_subscriptions_status_idx   ON public.stt_subscriptions (status);

ALTER TABLE public.stt_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.stt_subscriptions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS stt_subscriptions_select_own ON public.stt_subscriptions;
CREATE POLICY stt_subscriptions_select_own ON public.stt_subscriptions
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 3. stt_payments (ledger เงินเข้า) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stt_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id                  uuid REFERENCES public.stt_plans(id) ON DELETE SET NULL,
  kind                     text NOT NULL CHECK (kind IN ('subscription', 'topup')),
  amount                   numeric(12,2) NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'THB',
  minutes_granted          int  NOT NULL DEFAULT 0,    -- นาทีที่เติมเข้า quota จากการจ่ายนี้
  status                   text NOT NULL DEFAULT 'succeeded'
                             CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  stripe_invoice_id        text,
  stripe_event_id          text REFERENCES public.stripe_events(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);
-- idempotency: 1 invoice / 1 payment_intent → จ่ายได้ครั้งเดียว (กันเติมนาทีซ้ำจาก webhook retry)
CREATE UNIQUE INDEX IF NOT EXISTS stt_payments_invoice_uidx ON public.stt_payments (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stt_payments_pi_uidx      ON public.stt_payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stt_payments_profile_idx ON public.stt_payments (profile_id, created_at DESC);

ALTER TABLE public.stt_payments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.stt_payments FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS stt_payments_select_own ON public.stt_payments;
CREATE POLICY stt_payments_select_own ON public.stt_payments
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 4. RPC: upsert subscription (จาก customer.subscription.* / checkout) ───────
CREATE OR REPLACE FUNCTION public.upsert_stt_subscription(
  p_profile_id uuid,
  p_plan_id uuid,
  p_customer text,
  p_subscription text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.stt_subscriptions
    (profile_id, plan_id, stripe_customer_id, stripe_subscription_id, status,
     current_period_start, current_period_end, cancel_at_period_end, updated_at)
  VALUES
    (p_profile_id, p_plan_id, p_customer, p_subscription, p_status,
     p_period_start, p_period_end, COALESCE(p_cancel_at_period_end, false), now())
  ON CONFLICT (profile_id) DO UPDATE SET
    plan_id                = COALESCE(EXCLUDED.plan_id, public.stt_subscriptions.plan_id),
    stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id, public.stt_subscriptions.stripe_customer_id),
    stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, public.stt_subscriptions.stripe_subscription_id),
    status                 = EXCLUDED.status,
    current_period_start   = EXCLUDED.current_period_start,
    current_period_end     = EXCLUDED.current_period_end,
    cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
    updated_at             = now();
END; $$;

-- ── 5. RPC: apply payment (idempotent) — บันทึกเงินเข้า + เติมโควต้า ───────────
-- topup        → topup_seconds += นาที ; limit += นาที
-- subscription → plan_seconds = นาที (รอบใหม่) ; used = 0 ; limit = plan + topup (use-it-or-lose-it ต่อรอบ)
CREATE OR REPLACE FUNCTION public.apply_stt_payment(
  p_profile_id uuid,
  p_plan_id uuid,
  p_kind text,
  p_amount numeric,
  p_currency text,
  p_minutes int,
  p_status text,
  p_payment_intent text,
  p_invoice text,
  p_event_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing uuid; v_payment_id uuid; v_sec int := GREATEST(0, COALESCE(p_minutes, 0)) * 60;
BEGIN
  -- idempotency: เคยบันทึก invoice/payment_intent นี้แล้ว → คืนของเดิม ไม่เติมซ้ำ
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

  -- เติมโควต้าเฉพาะจ่ายสำเร็จ
  IF COALESCE(p_status, 'succeeded') = 'succeeded' AND v_sec > 0 THEN
    INSERT INTO public.stt_quota(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
    IF p_kind = 'topup' THEN
      UPDATE public.stt_quota
         SET topup_seconds = topup_seconds + v_sec,
             limit_seconds = limit_seconds + v_sec,
             updated_at = now()
       WHERE profile_id = p_profile_id;
    ELSE -- subscription renewal: โควต้าแผนรอบใหม่ + reset used (topup สะสมคงไว้)
      UPDATE public.stt_quota
         SET plan_seconds  = v_sec,
             used_seconds  = 0,
             limit_seconds = v_sec + topup_seconds,
             updated_at = now()
       WHERE profile_id = p_profile_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'duplicate', false);
END; $$;

-- เรียกได้เฉพาะ service role (webhook) — กัน user เติมโควต้า/เงินเองผ่าน PostgREST RPC
-- ⚠️ ต้อง REVOKE จาก anon + authenticated ตรง ๆ ด้วย (Supabase grant ให้ default — REVOKE FROM PUBLIC ไม่พอ)
REVOKE ALL ON FUNCTION public.upsert_stt_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stt_payment(uuid, uuid, text, numeric, text, int, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_stt_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stt_payment(uuid, uuid, text, numeric, text, int, text, text, text, text) TO service_role;

-- ── 6. Seed catalog (stripe_price_id เติมทีหลังหลังสร้าง Price ใน Stripe) ──────
INSERT INTO public.stt_plans (code, name, kind, minutes, price, currency, sort_order) VALUES
  ('pro_300_monthly',  'Pro 300 นาที/เดือน',   'subscription', 300,  99,  'THB', 10),
  ('pro_1200_monthly', 'Pro 1,200 นาที/เดือน', 'subscription', 1200, 990, 'THB', 20),
  ('topup_100',        'เติม 100 นาที',         'topup',        100,  150, 'THB', 30),
  ('topup_300',        'เติม 300 นาที',         'topup',        300,  390, 'THB', 40)
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload config';
COMMIT;
