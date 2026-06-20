-- ── T6: Token reporting — fold เงินเข้า + deferred revenue liability ───────────
-- ภาพบัญชีครบวงจรของ prepaid token (1 บาท = 100 token):
--   เงินเข้า (cash-in)        → v_billing_payments  (รวม token_payments เข้ากับ stt/org เดิม)
--   รายได้ที่รับรู้ (P&L)      → v_token_revenue     (debit=ใช้จริง + expire=breakage) [มีแล้ว T1]
--   หนี้สินคงค้าง (liability)  → v_token_liability   (เงินรับล่วงหน้าที่ยังไม่รับรู้)
--
-- สมการปิด (ต่อ lot ที่จ่ายเงินจริง): amount_paid = recognized(debit) + breakage(expire) + deferred(คงเหลือ)
-- token trial/bonus (amount_paid=0) → ไม่เป็นหนี้สิน/ไม่เป็นรายได้ (เป็น cost การตลาด)

BEGIN;

-- ── 1. v_billing_payments — เพิ่มสาย token_payments (stream='assistant_token') ──
CREATE OR REPLACE VIEW public.v_billing_payments
  WITH (security_invoker = true) AS
  SELECT
    sp.id, 'assistant'::text AS stream, 'profile'::text AS payer_kind, sp.profile_id AS payer_id,
    sp.plan_id, sp.kind, sp.amount, sp.currency, sp.status,
    sp.stripe_invoice_id, sp.stripe_payment_intent_id, sp.created_at
  FROM public.stt_payments sp
  UNION ALL
  SELECT
    op.id, 'erp'::text AS stream, 'org'::text AS payer_kind, op.org_id AS payer_id,
    NULL::uuid AS plan_id, op.kind, op.amount, op.currency, op.status,
    op.stripe_invoice_id, op.stripe_payment_intent_id, op.created_at
  FROM public.org_payments op
  UNION ALL
  SELECT
    tp.id, 'assistant_token'::text AS stream, 'profile'::text AS payer_kind, tp.profile_id AS payer_id,
    NULL::uuid AS plan_id, 'topup'::text AS kind, tp.amount, tp.currency, tp.status,
    tp.stripe_invoice_id, tp.stripe_payment_intent_id, tp.created_at
  FROM public.token_payments tp;

REVOKE ALL ON public.v_billing_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_billing_payments TO service_role;

-- ── 2. v_token_liability — หนี้สินเงินรับล่วงหน้า (deferred revenue คงค้าง) ─────
--   liability = Σ remaining × (amount_paid/granted) ของ lot active ที่จ่ายเงินจริง
--   (trial/bonus amount_paid=0 → 0) · outstanding_tokens_all = เครดิตที่ติดผู้ใช้ทั้งหมด
CREATE OR REPLACE VIEW public.v_token_liability
  WITH (security_invoker = true) AS
  SELECT
    COALESCE(SUM(remaining_tokens), 0)                                    AS outstanding_tokens_all,
    COALESCE(SUM(CASE WHEN source = 'topup' THEN remaining_tokens ELSE 0 END), 0) AS outstanding_tokens_paid,
    COALESCE(SUM(remaining_tokens * CASE WHEN granted_tokens > 0 THEN amount_paid / granted_tokens ELSE 0 END), 0)::numeric(14,4) AS deferred_revenue_thb,
    count(*) FILTER (WHERE remaining_tokens > 0)                          AS active_lots
  FROM public.token_lots
  WHERE status = 'active';

REVOKE ALL ON public.v_token_liability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_token_liability TO service_role;

NOTIFY pgrst, 'reload config';
COMMIT;
