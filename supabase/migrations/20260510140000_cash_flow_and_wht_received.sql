-- งบกระแสเงินสด (Indirect Method) and WHT Received report

BEGIN;

-- ─── rpc_cash_flow_indirect ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cash_flow_indirect(
  p_organization_id uuid,
  p_start_date      date,
  p_end_date        date,
  p_posted_only     boolean DEFAULT true
)
RETURNS TABLE (
  section    text,
  label      text,
  amount     numeric,
  sort_order int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
  -- opening balance (all transactions before period)
  pre AS (
    SELECT ji.account_id, a.type AS account_type, ji.debit, ji.credit
    FROM public.journal_items    ji
    JOIN public.journal_entries je ON je.id = ji.journal_entry_id
    JOIN public.accounts         a  ON a.id  = ji.account_id
    WHERE je.organization_id = p_organization_id
      AND je.entry_date < p_start_date
      AND (NOT p_posted_only OR je.status = 'posted')
  ),
  -- period transactions
  per AS (
    SELECT ji.account_id, a.type AS account_type, ji.debit, ji.credit, je.is_closing
    FROM public.journal_items    ji
    JOIN public.journal_entries je ON je.id = ji.journal_entry_id
    JOIN public.accounts         a  ON a.id  = ji.account_id
    WHERE je.organization_id = p_organization_id
      AND je.entry_date BETWEEN p_start_date AND p_end_date
      AND (NOT p_posted_only OR je.status = 'posted')
  ),
  -- net income for the period (income − expense)
  net_income AS (
    SELECT COALESCE(SUM(
      CASE account_type
        WHEN 'income'  THEN credit - debit
        WHEN 'expense' THEN debit  - credit
      END
    ), 0) AS amount
    FROM per
    WHERE account_type IN ('income','expense') AND NOT is_closing
  ),
  -- opening balance per account (assets: debit-credit; liab/equity: credit-debit)
  open_bal AS (
    SELECT account_id, account_type,
      SUM(CASE WHEN account_type = 'asset' THEN debit - credit ELSE credit - debit END) AS balance
    FROM pre
    GROUP BY account_id, account_type
  ),
  -- closing balance per account (cumulative through end date)
  all_txn AS (
    SELECT account_id, account_type, debit, credit FROM pre
    UNION ALL
    SELECT account_id, account_type, debit, credit FROM per
  ),
  close_bal AS (
    SELECT account_id, account_type,
      SUM(CASE WHEN account_type = 'asset' THEN debit - credit ELSE credit - debit END) AS balance
    FROM all_txn
    GROUP BY account_id, account_type
  ),
  -- balance change = closing − opening
  chg AS (
    SELECT
      COALESCE(c.account_id, o.account_id) AS account_id,
      COALESCE(c.account_type, o.account_type) AS account_type,
      COALESCE(c.balance, 0) - COALESCE(o.balance, 0) AS delta
    FROM close_bal c
    FULL OUTER JOIN open_bal o ON o.account_id = c.account_id
  ),
  acct AS (
    SELECT id, name FROM public.accounts WHERE organization_id = p_organization_id
  ),
  -- ── Operating adjustments ─────────────────────────────────────────────────
  ar_chg AS (
    SELECT -COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'asset'
      AND (acct.name ILIKE '%ลูกหนี้%' OR acct.name ILIKE '%receivable%')
  ),
  inv_chg AS (
    SELECT -COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'asset'
      AND (acct.name ILIKE '%สินค้า%' OR acct.name ILIKE '%inventory%' OR acct.name ILIKE '%stock%' OR acct.name ILIKE '%วัตถุดิบ%')
  ),
  prepaid_chg AS (
    SELECT -COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'asset'
      AND (acct.name ILIKE '%ล่วงหน้า%' OR acct.name ILIKE '%prepaid%' OR acct.name ILIKE '%จ่ายล่วงหน้า%')
  ),
  ap_chg AS (
    SELECT COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'liability'
      AND (acct.name ILIKE '%เจ้าหนี้%' OR acct.name ILIKE '%payable%')
      AND acct.name NOT ILIKE '%หัก ณ ที่จ่าย%'
  ),
  accrual_chg AS (
    SELECT COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'liability'
      AND (acct.name ILIKE '%ค้างจ่าย%' OR acct.name ILIKE '%accrued%')
  ),
  -- ── Investing ─────────────────────────────────────────────────────────────
  fixed_chg AS (
    SELECT -COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'asset'
      AND (acct.name ILIKE '%ทรัพย์สิน%' OR acct.name ILIKE '%สินทรัพย์ถาวร%'
           OR acct.name ILIKE '%อุปกรณ์%' OR acct.name ILIKE '%เครื่อง%'
           OR acct.name ILIKE '%fixed%'    OR acct.name ILIKE '%equipment%')
  ),
  -- ── Financing ─────────────────────────────────────────────────────────────
  loan_chg AS (
    SELECT COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'liability'
      AND (acct.name ILIKE '%เงินกู้%' OR acct.name ILIKE '%loan%' OR acct.name ILIKE '%เงินยืม%')
  ),
  equity_chg AS (
    SELECT COALESCE(SUM(delta), 0) AS amount
    FROM chg JOIN acct ON acct.id = chg.account_id
    WHERE account_type = 'equity'
      AND (acct.name ILIKE '%ทุน%' OR acct.name ILIKE '%capital%' OR acct.name ILIKE '%หุ้น%')
      AND acct.name NOT ILIKE '%กำไรสะสม%' AND acct.name NOT ILIKE '%retained%'
  )
SELECT 'operating', 'กำไร (ขาดทุน) สุทธิ',                         ni.amount,    10 FROM net_income ni
UNION ALL
SELECT 'operating', '(เพิ่ม) ลด ลูกหนี้การค้า',                    ar.amount,    20 FROM ar_chg ar      WHERE ar.amount <> 0
UNION ALL
SELECT 'operating', '(เพิ่ม) ลด สินค้าคงเหลือ',                    inv.amount,   30 FROM inv_chg inv    WHERE inv.amount <> 0
UNION ALL
SELECT 'operating', '(เพิ่ม) ลด ค่าใช้จ่ายจ่ายล่วงหน้า',           pre.amount,   40 FROM prepaid_chg pre WHERE pre.amount <> 0
UNION ALL
SELECT 'operating', 'เพิ่ม (ลด) เจ้าหนี้การค้า',                    ap.amount,    50 FROM ap_chg ap      WHERE ap.amount <> 0
UNION ALL
SELECT 'operating', 'เพิ่ม (ลด) ค่าใช้จ่ายค้างจ่าย',               acc.amount,   60 FROM accrual_chg acc WHERE acc.amount <> 0
UNION ALL
SELECT 'investing', 'ซื้อ (ขาย) สินทรัพย์ถาวร (สุทธิ)',            fa.amount,   110 FROM fixed_chg fa   WHERE fa.amount <> 0
UNION ALL
SELECT 'financing', 'กู้ยืม (ชำระ) เงินกู้',                        loan.amount, 210 FROM loan_chg loan  WHERE loan.amount <> 0
UNION ALL
SELECT 'financing', 'เพิ่ม (ลด) ทุนเรือนหุ้น',                      eq.amount,   220 FROM equity_chg eq  WHERE eq.amount <> 0
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cash_flow_indirect TO authenticated;

-- ─── rpc_wht_received ──────────────────────────────────────────────────────
-- WHT ที่ถูกลูกค้าหักจากรายได้เรา: queried from sale_documents
CREATE OR REPLACE FUNCTION public.rpc_wht_received(
  p_organization_id uuid,
  p_start_date      date DEFAULT NULL,
  p_end_date        date DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  doc_number      text,
  doc_type        text,
  issue_date      date,
  contact_name    text,
  total_amount    numeric,
  withholding_tax numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  sd.id,
  sd.doc_number,
  sd.doc_type,
  sd.issue_date,
  COALESCE(c.name, '') AS contact_name,
  sd.total_amount,
  sd.withholding_tax
FROM public.sale_documents sd
LEFT JOIN public.contacts c ON c.id = sd.contact_id
WHERE sd.organization_id = p_organization_id
  AND sd.withholding_tax IS NOT NULL
  AND sd.withholding_tax > 0
  AND (p_start_date IS NULL OR sd.issue_date >= p_start_date)
  AND (p_end_date   IS NULL OR sd.issue_date <= p_end_date)
ORDER BY sd.issue_date DESC, sd.doc_number DESC
$$;

GRANT EXECUTE ON FUNCTION public.rpc_wht_received TO authenticated;

COMMIT;
