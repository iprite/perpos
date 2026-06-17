-- ── Unified Billing Ledger (Phase 1) ─────────────────────────────────────────
-- ปิด gap ฝั่ง ERP: เดิม invoice.payment_succeeded ของ org แค่ set payment_status
-- ไม่บันทึกยอดเงินที่จ่ายไว้ที่ไหนเลย → คิด revenue/MRR จริงของ B2B ไม่ได้
--
-- แนวทาง (ไม่แตะ stt_payments / apply_stt_payment ที่ผูกกับ quota):
--   org_payments        ledger เงินเข้าฝั่ง ERP (per-org) — โครงเดียวกับ stt_payments
--   apply_org_payment   RPC idempotent (service role) — บันทึก 1 แถว/การจ่าย
--   v_billing_payments  view รวม 2 สาย (assistant + erp) สำหรับ reporting/MRR
BEGIN;

-- ── 1. org_payments (ledger เงินเข้า ฝั่ง ERP) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind                     text NOT NULL DEFAULT 'subscription'
                             CHECK (kind IN ('subscription', 'invoice')),
  amount                   numeric(12,2) NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'THB',
  status                   text NOT NULL DEFAULT 'succeeded'
                             CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  stripe_invoice_id        text,
  stripe_event_id          text REFERENCES public.stripe_events(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);
-- idempotency: 1 invoice/payment_intent ต่อ 1 status (กัน webhook retry)
-- แยกตาม status เพื่อให้ invoice ที่ "ล้มเหลวแล้วค่อยจ่ายสำเร็จ" บันทึกได้ทั้งคู่
-- (failed event กับ succeeded event เป็นคนละ row — row failed ไม่บล็อก row succeeded)
CREATE UNIQUE INDEX IF NOT EXISTS org_payments_invoice_uidx ON public.org_payments (stripe_invoice_id, status)        WHERE stripe_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_payments_pi_uidx      ON public.org_payments (stripe_payment_intent_id, status) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_payments_org_idx ON public.org_payments (org_id, created_at DESC);

ALTER TABLE public.org_payments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.org_payments FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS org_payments_select_admin ON public.org_payments;
CREATE POLICY org_payments_select_admin ON public.org_payments
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(org_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ── 2. RPC: apply_org_payment (idempotent) — บันทึกเงินเข้า ฝั่ง ERP ──────────
-- ไม่ยุ่งกับ entitlement (โมดูล/limit ของ org แยกจัดการที่ org_billing ตามเดิม)
CREATE OR REPLACE FUNCTION public.apply_org_payment(
  p_org_id uuid,
  p_kind text,
  p_amount numeric,
  p_currency text,
  p_status text,
  p_payment_intent text,
  p_invoice text,
  p_event_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing uuid; v_payment_id uuid;
BEGIN
  -- idempotency: เคยบันทึก invoice/payment_intent นี้ "ที่ status เดียวกัน" แล้ว → คืนของเดิม
  -- (แยกตาม status: invoice ที่ failed แล้วค่อย succeeded บันทึกได้ทั้งคู่)
  SELECT id INTO v_existing FROM public.org_payments
   WHERE status = COALESCE(p_status, 'succeeded')
     AND ((p_invoice IS NOT NULL AND stripe_invoice_id = p_invoice)
       OR (p_payment_intent IS NOT NULL AND stripe_payment_intent_id = p_payment_intent))
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'payment_id', v_existing, 'duplicate', true);
  END IF;

  INSERT INTO public.org_payments
    (org_id, kind, amount, currency, status, stripe_payment_intent_id, stripe_invoice_id, stripe_event_id)
  VALUES
    (p_org_id, COALESCE(p_kind, 'subscription'), COALESCE(p_amount, 0), COALESCE(p_currency, 'THB'),
     COALESCE(p_status, 'succeeded'), p_payment_intent, p_invoice, p_event_id)
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'duplicate', false);
END; $$;

-- เรียกได้เฉพาะ service role (webhook) — กัน user บันทึกเงินเองผ่าน PostgREST RPC
REVOKE ALL ON FUNCTION public.apply_org_payment(uuid, text, numeric, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_org_payment(uuid, text, numeric, text, text, text, text, text) TO service_role;

-- ── 3. v_billing_payments — view รวม 2 สาย (assistant + erp) ──────────────────
-- normalize คอลัมน์ให้ตรงกัน: reporting/MRR อ่านที่นี่ที่เดียว
-- security_invoker = RLS ของตารางต้นทางทำงาน (API ใช้ service role จึงอ่านได้ทั้งหมด)
CREATE OR REPLACE VIEW public.v_billing_payments
  WITH (security_invoker = true) AS
  SELECT
    sp.id,
    'assistant'::text          AS stream,
    'profile'::text            AS payer_kind,
    sp.profile_id              AS payer_id,
    sp.plan_id,
    sp.kind,
    sp.amount,
    sp.currency,
    sp.status,
    sp.stripe_invoice_id,
    sp.stripe_payment_intent_id,
    sp.created_at
  FROM public.stt_payments sp
  UNION ALL
  SELECT
    op.id,
    'erp'::text                AS stream,
    'org'::text                AS payer_kind,
    op.org_id                  AS payer_id,
    NULL::uuid                 AS plan_id,
    op.kind,
    op.amount,
    op.currency,
    op.status,
    op.stripe_invoice_id,
    op.stripe_payment_intent_id,
    op.created_at
  FROM public.org_payments op;

REVOKE ALL ON public.v_billing_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_billing_payments TO service_role;

NOTIFY pgrst, 'reload config';
COMMIT;
