-- ── T3: Token packs (prepaid top-up) + Auto top-up ───────────────────────────
-- โมเดลขาย = prepaid top-up ล้วน (เลิก subscription) · 1 บาท = 100 token
--   token_packs    = แคตตาล็อกแพ็กเติม (admin แก้ได้, มีโบนัสได้)
--   token_autotopup= ตั้งเติมอัตโนมัติเมื่อเครดิตต่ำกว่า buffer (บัตรบันทึกไว้, off-session)
-- ปลด subscription: stt_plans kind='subscription' → is_active=false (ไม่โชว์/ซื้อไม่ได้)

BEGIN;

-- ── 1. token_packs (แคตตาล็อกแพ็กเติม) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.token_packs (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  price           numeric(12,2) NOT NULL CHECK (price > 0),    -- บาทที่จ่ายจริง (ฐาน deferred revenue)
  currency        text NOT NULL DEFAULT 'THB',
  tokens          bigint NOT NULL CHECK (tokens > 0),          -- token ที่ได้รวมโบนัสแล้ว
  bonus_tokens    bigint NOT NULL DEFAULT 0,                   -- ส่วนโบนัส (แสดงผล; รวมใน tokens แล้ว)
  stripe_price_id text UNIQUE,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- seed: ฿99 / ฿299 (โบนัส 100) / ฿599 (โบนัส 2,100)
INSERT INTO public.token_packs (code, name, price, tokens, bonus_tokens, sort_order) VALUES
  ('pack_99',  'เติม ฿99',  99,   9900,     0, 1),
  ('pack_299', 'เติม ฿299', 299,  30000,  100, 2),
  ('pack_599', 'เติม ฿599', 599,  62000, 2100, 3)
ON CONFLICT (code) DO NOTHING;
ALTER TABLE public.token_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_packs_select_all ON public.token_packs;
CREATE POLICY token_packs_select_all ON public.token_packs
  FOR SELECT TO authenticated USING (is_active);     -- ผู้ใช้เห็นแพ็กที่เปิดขาย
DROP POLICY IF EXISTS token_packs_super_admin ON public.token_packs;
CREATE POLICY token_packs_super_admin ON public.token_packs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ── 2. token_autotopup (ตั้งเติมอัตโนมัติต่อ profile) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.token_autotopup (
  profile_id               uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled                  boolean NOT NULL DEFAULT false,
  threshold_tokens         bigint  NOT NULL DEFAULT 500 CHECK (threshold_tokens >= 0),
  pack_code                text REFERENCES public.token_packs(code) ON DELETE SET NULL,
  stripe_customer_id       text,
  stripe_payment_method_id text,
  card_brand               text,
  card_last4               text,
  status                   text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'charging')),
  charging_at              timestamptz,            -- กัน scheduler ยิงซ้ำระหว่าง PI ค้าง
  last_charged_at          timestamptz,
  last_error               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.token_autotopup ENABLE ROW LEVEL SECURITY;
-- ผู้ใช้อ่านของตัวเองได้ (โชว์สถานะ/บัตร) · เขียนผ่าน service role เท่านั้น (กันแก้บัตร/สถานะเอง)
REVOKE INSERT, UPDATE, DELETE ON public.token_autotopup FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS token_autotopup_select_own ON public.token_autotopup;
CREATE POLICY token_autotopup_select_own ON public.token_autotopup
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 3. ปลดแคตตาล็อกเก่าทั้งหมด (subscription + topup นาที/บอท) — เหลือ token_packs ล้วน ──
--   topup เดิม (meter='bot') เขียน bot_quota ที่เลิกใช้แล้ว → ต้องปิดกันขายค้าง
UPDATE public.stt_plans SET is_active = false, updated_at = now() WHERE is_active = true;

NOTIFY pgrst, 'reload config';
COMMIT;
