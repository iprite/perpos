-- ============================================================================
-- gov_procure — Data migration (Upgrade & replace ของ b2g, Q1=ii)
-- b2g_orders → gov_procure_orders  +  seed gov_procure_settings
-- Created at: 2026-07-10
--
-- นโยบาย (spec §8/§8.1, Review Log):
-- - Additive เท่านั้น — **ไม่ DROP b2g_orders** (rollback safety, §8 decision ii)
-- - Idempotent — คง id เดิม (b2g_orders.id → gov_procure_orders.id) + ON CONFLICT DO NOTHING
--   → รันซ้ำไม่ซ้ำแถว และ trace กลับ b2g ได้
-- - ระบุ org เป้าหมาย p2p-x-89 ชัด (CONTEXT §11: idempotent + ระบุ org_id, ไม่กระทบ org อื่น)
-- - derive stage แบบ hybrid (spec §4.1): job_status ก่อน แล้ว fallback milestone dates
-- - commission 5 field (base/amount/wht/net/slip) = NULL (b2g เดิมไม่มี — assign ทีหลัง)
-- - ไม่ migrate duration_days (N1: gov_procure ไม่มีคอลัมน์นี้ — pure derived)
-- - stage_manual_override = false ทุกแถว (derive อัตโนมัติ ณ cutover)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Migrate orders — INSERT ... SELECT พร้อม CASE derive stage
-- ---------------------------------------------------------------------------
INSERT INTO gov_procure_orders (
  id, org_id, created_by,
  seq_no, customer_name, department, company, qt_reference, product_description, start_date,
  price_incl_vat, price_excl_vat, withholding_tax, net_receivable, cost_price, gross_profit, security_deposit,
  transfer_date, transfer_round1, transfer_round2,
  customer_change, customer_change_slip, petty_cash, petty_cash_slip,
  transport_buy, transport_sell, transport_other, operate_89, total_cost_89, net_profit_89, profit_pct,
  commission_base_profit, commission_amount, commission_wht, commission_net_payable, commission_slip,
  contract_date, payment_order_date, delivery_date, receipt_date,
  finance_payment_date, support_payment_date, commission_payment_date,
  stage, stage_manual_override, notes,
  created_at, updated_at
)
SELECT
  b.id, b.org_id, b.created_by,
  b.seq_no, b.customer_name, b.department, b.company, b.qt_reference, b.product_description, b.start_date,
  b.price_incl_vat, b.price_excl_vat, b.withholding_tax, b.net_receivable, b.cost_price, b.gross_profit, b.security_deposit,
  b.transfer_date, b.transfer_round1, b.transfer_round2,
  b.customer_change, b.customer_change_slip, b.petty_cash, b.petty_cash_slip,
  b.transport_buy, b.transport_sell, b.transport_other, b.operate_89, b.total_cost_89, b.net_profit_89, b.profit_pct,
  -- commission 5 field: b2g เดิมไม่มี → NULL
  NULL, NULL, NULL, NULL, NULL,
  b.contract_date, b.payment_order_date, b.delivery_date, b.receipt_date,
  b.finance_payment_date, b.support_payment_date, b.commission_payment_date,
  -- derive stage (hybrid §4.1): job_status ก่อน แล้ว fallback milestone dates (ล่าสุด → ต่ำสุด)
  CASE
    WHEN b.job_status = 'รับเช็คแล้ว'                THEN 'paid'
    WHEN b.job_status = 'ส่งสินค้าแล้ว รอรับเช็ค'   THEN 'delivered'
    WHEN b.job_status = 'เซ็นสัญญาแล้ว รอส่งของ'    THEN 'contracted'
    WHEN b.receipt_date        IS NOT NULL          THEN 'paid'
    WHEN b.delivery_date       IS NOT NULL          THEN 'delivered'
    WHEN b.payment_order_date  IS NOT NULL          THEN 'procuring'
    WHEN b.contract_date       IS NOT NULL          THEN 'contracted'
    ELSE 'quotation'
  END AS stage,
  false AS stage_manual_override,
  b.notes,
  b.created_at, b.updated_at
FROM b2g_orders b
WHERE b.org_id IN (SELECT id FROM organizations WHERE slug = 'p2p-x-89')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Seed gov_procure_settings — 1 row สำหรับ org p2p-x-89 (defaults LOCKED)
-- ---------------------------------------------------------------------------
INSERT INTO gov_procure_settings (
  org_id, sla_threshold,
  pct_customer_change, pct_petty, pct_operate,
  line_alert_enabled, line_weekly_enabled, line_event_paid, line_event_delivered,
  line_recipients
)
SELECT
  o.id, 30,
  10, 5, 10,
  true, true, true, false,
  NULL           -- line_recipients: default owner+manager (resolve ตอน notify) — ยังไม่ seed รายชื่อ
FROM organizations o
WHERE o.slug = 'p2p-x-89'
ON CONFLICT (org_id) DO NOTHING;
