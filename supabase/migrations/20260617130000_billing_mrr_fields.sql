-- ── MRR fields on org_stripe (Phase 3) ───────────────────────────────────────
-- เก็บค่า recurring ที่ normalize เป็น "ต่อเดือน" จาก Stripe price (annual ÷ 12)
-- เพื่อคิด ERP MRR จากยอดจริง — ไม่พึ่ง org_billing.monthly_price ที่เป็น manual
BEGIN;

ALTER TABLE public.org_stripe
  ADD COLUMN IF NOT EXISTS mrr_amount numeric(12,2),  -- รายได้ recurring normalize/เดือน (null = ยังไม่รู้)
  ADD COLUMN IF NOT EXISTS interval   text;           -- 'month' | 'year' | ... (interval ดิบจาก Stripe)

COMMENT ON COLUMN public.org_stripe.mrr_amount IS 'recurring revenue normalize เป็นต่อเดือน (annual ÷ 12) จาก Stripe price — set โดย webhook';
COMMENT ON COLUMN public.org_stripe.interval   IS 'billing interval ดิบจาก Stripe (month/year)';

COMMIT;
