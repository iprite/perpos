-- ── Unified Prepaid Token Ledger (T1: DB layer) ──────────────────────────────
-- รวม quota แยกไซโล (stt=วินาที / bot=วินาที / pdf=หน้า) เป็น "token เดียว"
--   peg: 1 บาท = 100 token (1 token = ฿0.01)
--   - อายุ 1 ปี/ก้อนเครดิต (lot) · ใช้แบบ FIFO (ก้อนใกล้หมดอายุก่อนถูกตัดก่อน)
--   - rollover แบบค่ายมือถือ: เติมก่อนหมดอายุ → ก้อนเก่าทุกก้อนขยายอายุไป +1 ปี
--   - bank-grade append-only ledger (balance_after ต่อแถว) → รองรับ deferred revenue
--
-- T1 = additive ล้วน — RPC/ตาราง quota เดิม (consume_stt/pdf, bot hold/settle) ยังอยู่
-- จนกว่า T2 จะสลับ worker มาเรียก token RPC แล้วค่อยปลดระวาง (กัน deploy พัง)
--
-- ความปลอดภัย RPC: SECURITY DEFINER + REVOKE จาก anon, authenticated (Supabase grant
--   EXECUTE ให้ default → REVOKE FROM PUBLIC ไม่พอ) + GRANT เฉพาะ service_role
--   (ดู 20260616195000_stt_quota_rpc_lockdown.sql / 20260619100000_pdf_compress_kind.sql)

BEGIN;

-- ── 1. token_settings (singleton) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.token_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),   -- singleton
  default_trial_tokens bigint NOT NULL DEFAULT 10000 CHECK (default_trial_tokens >= 0),  -- ฿100 trial (free สำหรับ user ใหม่)
  expiry_days         int    NOT NULL DEFAULT 365 CHECK (expiry_days > 0),               -- อายุเครดิตที่ "เติมเงิน"
  trial_expiry_days   int    NOT NULL DEFAULT 30  CHECK (trial_expiry_days > 0),         -- อายุเครดิต "trial" (สั้นกว่า)
  reminder_days       int[]  NOT NULL DEFAULT '{30,7}',
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.token_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.token_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_settings_super_admin ON public.token_settings;
CREATE POLICY token_settings_super_admin ON public.token_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ── 2. token_rates (super_admin แก้ได้ — แปลงหน่วย service → token) ─────────────
--   tokens_per_unit = token ที่หักต่อ 1 หน่วย (stt/bot = วินาที, pdf = หน้า)
--   ค่า seed = placeholder อิงต้นทุน + margin · ตัวเลขจริงเคาะภายหลังผ่าน admin
CREATE TABLE IF NOT EXISTS public.token_rates (
  service         text PRIMARY KEY CHECK (service IN ('stt', 'bot', 'pdf')),
  unit            text NOT NULL CHECK (unit IN ('second', 'page')),
  tokens_per_unit numeric(12,4) NOT NULL CHECK (tokens_per_unit >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
-- rate จริง (เคาะจากต้นทุน Gemini/Recall + margin ~2.5×, 2026-06-20):
--   STT ฿1.00/นาที  → 100 token/นาที → 1.6667 token/วินาที  (ต้นทุน ~฿0.40/นาที)
--   bot ฿1.50/นาที  → 150 token/นาที → 2.5    token/วินาที  (ต้นทุน ~฿0.69/นาที = Gemini + Recall)
--   pdf ฿1.00/หน้า  → 100 token/หน้า                        (ต้นทุน ~฿0.01–0.05/หน้า, value-based)
INSERT INTO public.token_rates (service, unit, tokens_per_unit) VALUES
  ('stt', 'second', 1.6667),
  ('bot', 'second', 2.5),
  ('pdf', 'page',   100)
ON CONFLICT (service) DO NOTHING;
ALTER TABLE public.token_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_rates_select_all ON public.token_rates;
CREATE POLICY token_rates_select_all ON public.token_rates
  FOR SELECT TO authenticated USING (true);   -- rate โชว์ผู้ใช้ได้ (คิดราคา)
DROP POLICY IF EXISTS token_rates_super_admin ON public.token_rates;
CREATE POLICY token_rates_super_admin ON public.token_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ── 3. token_accounts (1 แถว/profile — แถว lock + cache ยอด) ───────────────────
CREATE TABLE IF NOT EXISTS public.token_accounts (
  profile_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_tokens   bigint NOT NULL DEFAULT 0 CHECK (balance_tokens >= 0),  -- = Σ remaining ของ lot active
  lifetime_granted bigint NOT NULL DEFAULT 0,
  lifetime_spent   bigint NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.token_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_accounts_select_own ON public.token_accounts;
CREATE POLICY token_accounts_select_own ON public.token_accounts
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 4. token_lots (ก้อนเครดิต — FIFO/expiry/rollover/deferred-revenue) ─────────
CREATE TABLE IF NOT EXISTS public.token_lots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('topup', 'trial', 'bonus', 'adjust')),
  payment_id      uuid,   -- → token_payments (FK เพิ่มหลังสร้างตาราง 6)
  granted_tokens  bigint NOT NULL CHECK (granted_tokens >= 0),
  remaining_tokens bigint NOT NULL CHECK (remaining_tokens >= 0),
  amount_paid     numeric(12,2) NOT NULL DEFAULT 0,   -- บาทจริง → ฐาน deferred revenue
  currency        text NOT NULL DEFAULT 'THB',
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'expired')),
  reminded_30_at  timestamptz,
  reminded_7_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_lots_fifo   ON public.token_lots (profile_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_token_lots_sweep  ON public.token_lots (status, expires_at) WHERE status = 'active';
ALTER TABLE public.token_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_lots_select_own ON public.token_lots;
CREATE POLICY token_lots_select_own ON public.token_lots
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 5. token_ledger (append-only journal — bank statement) ────────────────────
CREATE TABLE IF NOT EXISTS public.token_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lot_id        uuid REFERENCES public.token_lots(id) ON DELETE SET NULL,
  job_id        uuid REFERENCES public.assistant_jobs(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('grant', 'debit', 'refund', 'expire', 'adjust')),
  service       text CHECK (service IN ('stt', 'bot', 'pdf')),
  tokens        bigint NOT NULL,            -- signed: grant/refund +, debit/expire −
  balance_after bigint NOT NULL,            -- ยอดบัญชีหลังรายการนี้
  revenue_thb   numeric(12,4),              -- debit = รายได้รับรู้; expire = breakage; grant/refund = 0
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_ledger_profile ON public.token_ledger (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_ledger_job     ON public.token_ledger (job_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_revenue ON public.token_ledger (kind, created_at);
ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_ledger_select_own ON public.token_ledger;
CREATE POLICY token_ledger_select_own ON public.token_ledger
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 6. token_payments (Stripe top-up ครั้งเดียว — คู่ขนาน stt_payments) ────────
CREATE TABLE IF NOT EXISTS public.token_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_code                text,
  tokens                   bigint NOT NULL DEFAULT 0,
  amount                   numeric(12,2) NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'THB',
  status                   text NOT NULL DEFAULT 'succeeded'
                             CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  stripe_invoice_id        text,
  stripe_event_id          text REFERENCES public.stripe_events(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS token_payments_pi_uidx      ON public.token_payments (stripe_payment_intent_id, status) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS token_payments_invoice_uidx ON public.token_payments (stripe_invoice_id, status)        WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS token_payments_profile_idx ON public.token_payments (profile_id, created_at DESC);
ALTER TABLE public.token_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_payments_select_own ON public.token_payments;
CREATE POLICY token_payments_select_own ON public.token_payments
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
-- FK lot → payment (เพิ่มหลังตารางพร้อม)
ALTER TABLE public.token_lots DROP CONSTRAINT IF EXISTS token_lots_payment_fk;
ALTER TABLE public.token_lots ADD CONSTRAINT token_lots_payment_fk
  FOREIGN KEY (payment_id) REFERENCES public.token_payments(id) ON DELETE SET NULL;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ RPC (service_role เท่านั้น)                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ── 7a. token_grant — เติมเครดิต (topup/trial/bonus/adjust) + rollover ─────────
CREATE OR REPLACE FUNCTION public.token_grant(
  p_profile_id  uuid,
  p_tokens      bigint,
  p_amount_paid numeric DEFAULT 0,
  p_source      text    DEFAULT 'topup',
  p_payment_id  uuid    DEFAULT NULL,
  p_currency    text    DEFAULT 'THB'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expiry_days int;
  v_expires_at  timestamptz;
  v_balance     bigint;
  v_lot_id      uuid;
BEGIN
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_tokens');
  END IF;

  -- อายุตาม source: trial = trial_expiry_days (สั้น), อื่น ๆ (topup/bonus/adjust) = expiry_days
  SELECT CASE WHEN COALESCE(p_source,'topup') = 'trial' THEN trial_expiry_days ELSE expiry_days END
    INTO v_expiry_days FROM public.token_settings WHERE id = true;
  v_expiry_days := COALESCE(v_expiry_days, CASE WHEN COALESCE(p_source,'topup') = 'trial' THEN 30 ELSE 365 END);
  v_expires_at  := now() + make_interval(days => v_expiry_days);

  -- lock account (สร้างถ้ายังไม่มี)
  INSERT INTO public.token_accounts(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
  SELECT balance_tokens INTO v_balance FROM public.token_accounts WHERE profile_id = p_profile_id FOR UPDATE;

  -- rollover แบบค่ายมือถือ: เติมก่อนหมด → ขยายอายุ lot เดิม "เฉพาะให้ยาวขึ้น" (GREATEST กันหดอายุ
  -- กรณี trial 30วันมาทีหลัง) · reset reminder flag เฉพาะก้อนที่ถูกขยายจริง (จะได้เตือนตามอายุใหม่)
  UPDATE public.token_lots
     SET expires_at     = GREATEST(expires_at, v_expires_at),
         reminded_30_at = CASE WHEN v_expires_at > expires_at THEN NULL ELSE reminded_30_at END,
         reminded_7_at  = CASE WHEN v_expires_at > expires_at THEN NULL ELSE reminded_7_at  END
   WHERE profile_id = p_profile_id AND status = 'active' AND remaining_tokens > 0;

  -- ก้อนใหม่
  INSERT INTO public.token_lots
    (profile_id, source, payment_id, granted_tokens, remaining_tokens, amount_paid, currency, granted_at, expires_at)
  VALUES
    (p_profile_id, COALESCE(p_source, 'topup'), p_payment_id, p_tokens, p_tokens,
     COALESCE(p_amount_paid, 0), COALESCE(p_currency, 'THB'), now(), v_expires_at)
  RETURNING id INTO v_lot_id;

  v_balance := v_balance + p_tokens;
  UPDATE public.token_accounts
     SET balance_tokens = v_balance, lifetime_granted = lifetime_granted + p_tokens, updated_at = now()
   WHERE profile_id = p_profile_id;

  INSERT INTO public.token_ledger(profile_id, lot_id, kind, tokens, balance_after, revenue_thb, reason)
  VALUES (p_profile_id, v_lot_id, 'grant', p_tokens, v_balance, 0, COALESCE(p_source, 'topup'));

  RETURN jsonb_build_object('ok', true, 'balance_after', v_balance, 'lot_id', v_lot_id, 'new_expiry', v_expires_at);
END; $$;

-- ── 7b. token_reserve — หักเครดิต FIFO ตอนเริ่มงาน (idempotent ต่อ job) ────────
CREATE OR REPLACE FUNCTION public.token_reserve(
  p_profile_id uuid,
  p_job_id     uuid,
  p_service    text,
  p_units      numeric,
  p_source     text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rate     numeric;
  v_tokens   bigint;
  v_balance  bigint;
  v_prior    bigint;
  v_lot      record;
  v_take     bigint;
  v_remaining_need bigint;
  v_rev_ratio numeric;
BEGIN
  IF p_service NOT IN ('stt', 'bot', 'pdf') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_service');
  END IF;

  -- idempotency: เคยหักของ job นี้แล้ว → คืนผลเดิม (กันหักซ้ำตอน retry)
  IF p_job_id IS NOT NULL THEN
    SELECT COALESCE(SUM(-tokens), 0) INTO v_prior
      FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'debit';
    IF v_prior > 0 THEN
      SELECT balance_tokens INTO v_balance FROM public.token_accounts WHERE profile_id = p_profile_id;
      RETURN jsonb_build_object('ok', true, 'tokens_charged', v_prior, 'balance_after', COALESCE(v_balance, 0), 'duplicate', true);
    END IF;
  END IF;

  SELECT tokens_per_unit INTO v_rate FROM public.token_rates WHERE service = p_service;
  IF v_rate IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_rate'); END IF;
  v_tokens := CEIL(COALESCE(p_units, 0) * v_rate)::bigint;
  IF v_tokens < 0 THEN v_tokens := 0; END IF;

  INSERT INTO public.token_accounts(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
  SELECT balance_tokens INTO v_balance FROM public.token_accounts WHERE profile_id = p_profile_id FOR UPDATE;

  -- เก็บกวาด lot หมดอายุที่ค้างก่อน (กันตัดจากก้อนที่หมดอายุแล้ว)
  -- breakage revenue = remaining × (amount_paid/granted) — trial/bonus (จ่าย 0) = breakage 0
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

  IF v_tokens > v_balance THEN
    RETURN jsonb_build_object('ok', false, 'balance', v_balance, 'needed', v_tokens);
  END IF;

  IF v_tokens = 0 THEN
    RETURN jsonb_build_object('ok', true, 'tokens_charged', 0, 'balance_after', v_balance);
  END IF;

  -- FIFO: ตัดจากก้อนใกล้หมดอายุก่อน
  v_remaining_need := v_tokens;
  FOR v_lot IN
    SELECT id, remaining_tokens, granted_tokens, amount_paid FROM public.token_lots
     WHERE profile_id = p_profile_id AND status = 'active' AND remaining_tokens > 0 AND expires_at >= now()
     ORDER BY expires_at ASC, granted_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_need <= 0;
    v_take := LEAST(v_remaining_need, v_lot.remaining_tokens);
    v_balance := v_balance - v_take;
    v_rev_ratio := CASE WHEN v_lot.granted_tokens > 0 THEN v_lot.amount_paid / v_lot.granted_tokens ELSE 0 END;
    INSERT INTO public.token_ledger(profile_id, lot_id, job_id, kind, service, tokens, balance_after, revenue_thb, reason)
    VALUES (p_profile_id, v_lot.id, p_job_id, 'debit', p_service, -v_take, v_balance, v_take * v_rev_ratio, p_source);
    UPDATE public.token_lots
       SET remaining_tokens = remaining_tokens - v_take,
           status = CASE WHEN remaining_tokens - v_take = 0 THEN 'exhausted' ELSE status END
     WHERE id = v_lot.id;
    v_remaining_need := v_remaining_need - v_take;
  END LOOP;

  UPDATE public.token_accounts
     SET balance_tokens = v_balance, lifetime_spent = lifetime_spent + v_tokens, updated_at = now()
   WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object('ok', true, 'tokens_charged', v_tokens, 'balance_after', v_balance);
END; $$;

-- ── 7c. token_refund — คืนเครดิตเข้า lot เดิม (idempotent; partial สำหรับ bot settle) ─
CREATE OR REPLACE FUNCTION public.token_refund(
  p_job_id uuid,
  p_tokens bigint DEFAULT NULL   -- NULL = คืนเต็มที่เหลือ; มีค่า = คืนบางส่วน
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid;
  v_debited bigint;
  v_refunded bigint;
  v_net bigint;
  v_target bigint;       -- จำนวนที่ตั้งใจคืนรอบนี้
  v_to_refund bigint;    -- ยอดคงเหลือที่ยังต้องคืน (นับถอยหลังในลูป)
  v_done bigint;         -- คืนจริง = v_target - v_to_refund
  v_balance bigint;
  v_d record;
  v_lot_refunded bigint;
  v_lot_net bigint;
  v_take bigint;
BEGIN
  IF p_job_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_job'); END IF;

  SELECT profile_id, COALESCE(SUM(-tokens), 0) INTO v_profile, v_debited
    FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'debit'
    GROUP BY profile_id;
  IF v_profile IS NULL OR v_debited <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_to_refund');
  END IF;

  SELECT COALESCE(SUM(tokens), 0) INTO v_refunded
    FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'refund';
  v_net := v_debited - v_refunded;
  IF v_net <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'tokens_refunded', 0, 'duplicate', true);
  END IF;

  v_target := CASE WHEN p_tokens IS NULL THEN v_net ELSE LEAST(p_tokens, v_net) END;
  IF v_target <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'tokens_refunded', 0);
  END IF;
  v_to_refund := v_target;

  SELECT balance_tokens INTO v_balance FROM public.token_accounts WHERE profile_id = v_profile FOR UPDATE;

  -- คืนเข้าก้อนที่หักไป (debit rows ของ job) — ก้อนละ 1 row, คืนตามสัดส่วนที่ยังค้าง
  -- group ตาม lot_id: 1 job อาจมีหลาย debit row บน lot เดียวกัน (เช่น bot hold + extend)
  FOR v_d IN
    SELECT lot_id, MAX(service) AS service, SUM(-tokens) AS debited
      FROM public.token_ledger
     WHERE job_id = p_job_id AND kind = 'debit' AND lot_id IS NOT NULL
     GROUP BY lot_id
     ORDER BY MAX(created_at) DESC
  LOOP
    EXIT WHEN v_to_refund <= 0;
    SELECT COALESCE(SUM(tokens), 0) INTO v_lot_refunded
      FROM public.token_ledger WHERE job_id = p_job_id AND kind = 'refund' AND lot_id = v_d.lot_id;
    v_lot_net := v_d.debited - v_lot_refunded;
    v_take := LEAST(v_to_refund, v_lot_net);
    IF v_take <= 0 THEN CONTINUE; END IF;
    v_balance := v_balance + v_take;
    UPDATE public.token_lots
       SET remaining_tokens = remaining_tokens + v_take,
           status = CASE WHEN status = 'exhausted' AND expires_at >= now() THEN 'active' ELSE status END
     WHERE id = v_d.lot_id;
    INSERT INTO public.token_ledger(profile_id, lot_id, job_id, kind, service, tokens, balance_after, revenue_thb, reason)
    VALUES (v_profile, v_d.lot_id, p_job_id, 'refund', v_d.service, v_take, v_balance, 0, 'refund');
    v_to_refund := v_to_refund - v_take;
  END LOOP;

  v_done := v_target - v_to_refund;   -- คืนจริง
  UPDATE public.token_accounts
     SET balance_tokens = v_balance, lifetime_spent = GREATEST(0, lifetime_spent - v_done), updated_at = now()
   WHERE profile_id = v_profile;

  RETURN jsonb_build_object('ok', true, 'tokens_refunded', v_done, 'balance_after', v_balance);
END; $$;

-- ── 7d. token_expire_sweep — หมดอายุ lot ที่เลยกำหนด (scheduler เรียก) ─────────
CREATE OR REPLACE FUNCTION public.token_expire_sweep()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prof uuid; v_lot record; v_balance bigint; v_rev_ratio numeric; v_count int := 0;
BEGIN
  -- ล็อก "account ก่อน lots" ต่อ profile — ลำดับเดียวกับ reserve/grant (กัน deadlock)
  FOR v_prof IN
    SELECT DISTINCT profile_id FROM public.token_lots
     WHERE status = 'active' AND expires_at < now() AND remaining_tokens > 0
  LOOP
    SELECT balance_tokens INTO v_balance FROM public.token_accounts WHERE profile_id = v_prof FOR UPDATE;
    FOR v_lot IN
      SELECT id, remaining_tokens, granted_tokens, amount_paid FROM public.token_lots
       WHERE profile_id = v_prof AND status = 'active' AND expires_at < now() AND remaining_tokens > 0
       FOR UPDATE
    LOOP
      v_balance := GREATEST(0, v_balance - v_lot.remaining_tokens);
      v_rev_ratio := CASE WHEN v_lot.granted_tokens > 0 THEN v_lot.amount_paid / v_lot.granted_tokens ELSE 0 END;
      INSERT INTO public.token_ledger(profile_id, lot_id, kind, tokens, balance_after, revenue_thb, reason)
      VALUES (v_prof, v_lot.id, 'expire', -v_lot.remaining_tokens, v_balance, v_lot.remaining_tokens * v_rev_ratio, 'expired');
      UPDATE public.token_lots SET remaining_tokens = 0, status = 'expired' WHERE id = v_lot.id;
      v_count := v_count + 1;
    END LOOP;
    UPDATE public.token_accounts SET balance_tokens = v_balance, updated_at = now() WHERE profile_id = v_prof;
  END LOOP;
  RETURN v_count;
END; $$;

-- ── 7e. token_admin_grant — super_admin เติม/ปรับมือ (kind=adjust, amount_paid=0) ─
CREATE OR REPLACE FUNCTION public.token_admin_grant(p_profile_id uuid, p_tokens bigint, p_reason text DEFAULT 'admin_adjust')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.token_grant(p_profile_id, p_tokens, 0, 'adjust', NULL, 'THB');
END; $$;

-- ── 7f. ความปลอดภัย: RPC เรียกได้เฉพาะ service_role ───────────────────────────
REVOKE ALL ON FUNCTION public.token_grant(uuid, bigint, numeric, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.token_reserve(uuid, uuid, text, numeric, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.token_refund(uuid, bigint)                            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.token_expire_sweep()                                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.token_admin_grant(uuid, bigint, text)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.token_grant(uuid, bigint, numeric, text, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.token_reserve(uuid, uuid, text, numeric, text)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.token_refund(uuid, bigint)                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.token_expire_sweep()                                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.token_admin_grant(uuid, bigint, text)                 FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.token_grant(uuid, bigint, numeric, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.token_reserve(uuid, uuid, text, numeric, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.token_refund(uuid, bigint)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.token_expire_sweep()                                  TO service_role;
GRANT EXECUTE ON FUNCTION public.token_admin_grant(uuid, bigint, text)                 TO service_role;

-- ── 8. v_token_revenue — รายได้ที่รับรู้ + breakage ต่อเดือน/service ───────────
--   debit = รายได้รับรู้จากการใช้จริง · expire = breakage (เครดิตหมดอายุ)
--   ตัวเลข JE รายเดือน: Dr รายได้รับล่วงหน้า / Cr รายได้
CREATE OR REPLACE VIEW public.v_token_revenue
  WITH (security_invoker = true) AS
  SELECT
    date_trunc('month', created_at)              AS period,
    CASE WHEN kind = 'expire' THEN 'breakage' ELSE service END AS revenue_type,
    COUNT(*)                                     AS entries,
    SUM(revenue_thb)                             AS revenue_thb
  FROM public.token_ledger
  WHERE kind IN ('debit', 'expire') AND revenue_thb IS NOT NULL
  GROUP BY 1, 2;
REVOKE ALL ON public.v_token_revenue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_token_revenue TO service_role;

NOTIFY pgrst, 'reload config';
COMMIT;
