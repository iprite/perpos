-- Finance Module
-- Covers: finance_accounts (petty cash / bank / payment channel / reserve),
--         check_transactions, rpc_balance_sheet, rpc_general_ledger

BEGIN;

-- ── finance_accounts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  account_category  text NOT NULL CHECK (account_category IN (
                      'petty_cash','bank','payment_channel','reserve')),
  name              text NOT NULL,
  linked_account_id uuid,
  -- bank-specific
  bank_name         text,
  account_number    text,
  branch            text,
  bank_account_type text CHECK (bank_account_type IN ('current','savings','fixed') OR bank_account_type IS NULL),
  -- payment channel-specific
  channel_type      text CHECK (channel_type IN ('cash','bank_transfer','qr_promptpay','credit_card','other') OR channel_type IS NULL),
  -- petty-cash-specific
  custodian_name    text,
  -- reserve-specific
  purpose           text,
  -- common
  initial_balance   numeric(18,2) NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  notes             text,
  created_by        uuid NOT NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_accounts_org_fk     FOREIGN KEY (organization_id)   REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT finance_accounts_acct_fk    FOREIGN KEY (linked_account_id) REFERENCES public.accounts(id)     ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_accounts_org_cat ON public.finance_accounts (organization_id, account_category);

DROP TRIGGER IF EXISTS trg_finance_accounts_updated_at ON public.finance_accounts;
CREATE TRIGGER trg_finance_accounts_updated_at
  BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── check_transactions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.check_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  txn_type            text NOT NULL CHECK (txn_type IN ('deposit','payment')),
  check_number        text NOT NULL,
  bank_name           text,
  check_date          date NOT NULL,
  due_date            date,
  amount              numeric(18,2) NOT NULL,
  contact_id          uuid,
  finance_account_id  uuid,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','cleared','bounced','voided')),
  notes               text,
  created_by          uuid NOT NULL DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_transactions_org_fk    FOREIGN KEY (organization_id)  REFERENCES public.organizations(id)    ON DELETE CASCADE,
  CONSTRAINT check_transactions_fa_fk     FOREIGN KEY (finance_account_id) REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  CONSTRAINT check_transactions_contact_fk FOREIGN KEY (contact_id)      REFERENCES public.contacts(id)         ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_check_transactions_org_type ON public.check_transactions (organization_id, txn_type);
CREATE INDEX IF NOT EXISTS idx_check_transactions_org_date ON public.check_transactions (organization_id, check_date DESC);

DROP TRIGGER IF EXISTS trg_check_transactions_updated_at ON public.check_transactions;
CREATE TRIGGER trg_check_transactions_updated_at
  BEFORE UPDATE ON public.check_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_transactions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fa_select ON public.finance_accounts;
CREATE POLICY fa_select ON public.finance_accounts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = finance_accounts.organization_id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS fa_insert ON public.finance_accounts;
CREATE POLICY fa_insert ON public.finance_accounts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = finance_accounts.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

DROP POLICY IF EXISTS fa_update ON public.finance_accounts;
CREATE POLICY fa_update ON public.finance_accounts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = finance_accounts.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

DROP POLICY IF EXISTS fa_delete ON public.finance_accounts;
CREATE POLICY fa_delete ON public.finance_accounts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = finance_accounts.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

DROP POLICY IF EXISTS ct_select ON public.check_transactions;
CREATE POLICY ct_select ON public.check_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = check_transactions.organization_id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS ct_insert ON public.check_transactions;
CREATE POLICY ct_insert ON public.check_transactions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = check_transactions.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

DROP POLICY IF EXISTS ct_update ON public.check_transactions;
CREATE POLICY ct_update ON public.check_transactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = check_transactions.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

REVOKE ALL ON public.finance_accounts   FROM anon;
REVOKE ALL ON public.check_transactions FROM anon;

-- ── rpc_balance_sheet ─────────────────────────────────────────────────────────
-- Returns balance sheet as of p_as_of_date using the same running-total
-- approach as rpc_trial_balance but collapses to a single net balance per account.

CREATE OR REPLACE FUNCTION public.rpc_balance_sheet(
  p_organization_id uuid,
  p_as_of_date      date,
  p_posted_only     boolean DEFAULT true
)
RETURNS TABLE (
  section           text,
  account_id        uuid,
  account_code      text,
  account_name      text,
  parent_account_id uuid,
  level             int,
  balance           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH RECURSIVE
  authz AS (
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
    ) AS ok
  ),
  acct AS (
    SELECT id, code, name, type, parent_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND is_active = true
  ),
  roots AS (
    SELECT id, parent_account_id, code, name, type, 0 AS lvl, code AS sort_key
    FROM acct WHERE parent_account_id IS NULL
    UNION ALL
    SELECT a.id, a.parent_account_id, a.code, a.name, a.type,
           r.lvl + 1, r.sort_key || '/' || a.code
    FROM acct a JOIN roots r ON a.parent_account_id = r.id
  ),
  closure AS (
    SELECT id AS ancestor_id, id AS account_id FROM acct
    UNION ALL
    SELECT c.ancestor_id, a.id
    FROM closure c JOIN acct a ON a.parent_account_id = c.account_id
  ),
  posted AS (
    SELECT ji.account_id, SUM(ji.debit) AS dr, SUM(ji.credit) AS cr
    FROM public.journal_items ji
    JOIN public.journal_entries je ON je.id = ji.journal_entry_id
    WHERE je.organization_id = p_organization_id
      AND je.entry_date <= p_as_of_date
      AND (NOT p_posted_only OR je.status = 'posted')
    GROUP BY ji.account_id
  ),
  leaf_balance AS (
    SELECT c.ancestor_id AS account_id,
           COALESCE(SUM(p.dr), 0) AS total_dr,
           COALESCE(SUM(p.cr), 0) AS total_cr
    FROM closure c
    LEFT JOIN posted p ON p.account_id = c.account_id
    GROUP BY c.ancestor_id
  )
SELECT
  r.type                                              AS section,
  r.id                                               AS account_id,
  r.code                                             AS account_code,
  r.name                                             AS account_name,
  r.parent_account_id,
  r.lvl                                              AS level,
  CASE r.type
    WHEN 'asset'   THEN ROUND(lb.total_dr - lb.total_cr, 2)
    ELSE                ROUND(lb.total_cr - lb.total_dr, 2)
  END                                                AS balance
FROM roots r
JOIN leaf_balance lb ON lb.account_id = r.id
CROSS JOIN authz
WHERE authz.ok
  AND r.type IN ('asset','liability','equity')
ORDER BY r.sort_key;
$$;

REVOKE ALL  ON FUNCTION public.rpc_balance_sheet(uuid, date, boolean) FROM anon;
REVOKE ALL  ON FUNCTION public.rpc_balance_sheet(uuid, date, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_balance_sheet(uuid, date, boolean) TO authenticated;

-- ── rpc_general_ledger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_general_ledger(
  p_organization_id uuid,
  p_account_id      uuid,
  p_start_date      date,
  p_end_date        date,
  p_posted_only     boolean DEFAULT true
)
RETURNS TABLE (
  journal_entry_id uuid,
  entry_date       date,
  reference_number text,
  memo             text,
  description      text,
  debit            numeric,
  credit           numeric,
  running_balance  numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
  authz AS (
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = p_organization_id AND m.user_id = auth.uid()
    ) AS ok
  ),
  opening AS (
    SELECT COALESCE(SUM(ji.debit) - SUM(ji.credit), 0) AS bal
    FROM public.journal_items ji
    JOIN public.journal_entries je ON je.id = ji.journal_entry_id
    WHERE je.organization_id = p_organization_id
      AND ji.account_id = p_account_id
      AND je.entry_date < p_start_date
      AND (NOT p_posted_only OR je.status = 'posted')
  ),
  lines AS (
    SELECT
      je.id               AS journal_entry_id,
      je.entry_date,
      je.reference_number,
      je.memo,
      ji.description,
      ji.debit,
      ji.credit
    FROM public.journal_items ji
    JOIN public.journal_entries je ON je.id = ji.journal_entry_id
    CROSS JOIN authz
    WHERE je.organization_id = p_organization_id
      AND ji.account_id = p_account_id
      AND je.entry_date BETWEEN p_start_date AND p_end_date
      AND (NOT p_posted_only OR je.status = 'posted')
      AND authz.ok
    ORDER BY je.entry_date, je.reference_number, ji.id
  )
SELECT
  l.journal_entry_id,
  l.entry_date,
  l.reference_number,
  l.memo,
  l.description,
  l.debit,
  l.credit,
  ROUND(
    (SELECT bal FROM opening)
    + SUM(l.debit - l.credit) OVER (ORDER BY l.entry_date, l.journal_entry_id, l.description ROWS UNBOUNDED PRECEDING),
    2
  ) AS running_balance
FROM lines l;
$$;

REVOKE ALL  ON FUNCTION public.rpc_general_ledger(uuid, uuid, date, date, boolean) FROM anon;
REVOKE ALL  ON FUNCTION public.rpc_general_ledger(uuid, uuid, date, date, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_general_ledger(uuid, uuid, date, date, boolean) TO authenticated;

COMMIT;
