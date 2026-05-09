BEGIN;

ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS is_closing boolean NOT NULL DEFAULT false;

ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS source_type text;

ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS idx_je_org_date_posted ON public.journal_entries (organization_id, entry_date DESC) WHERE status = 'posted';
CREATE INDEX IF NOT EXISTS idx_ji_org_account ON public.journal_items (organization_id, account_id);

CREATE OR REPLACE VIEW public.vw_gl_posted_items AS
SELECT
  ji.organization_id,
  je.entry_date,
  je.status,
  je.is_closing,
  je.source_type,
  je.source_id,
  ji.journal_entry_id,
  ji.line_no,
  ji.account_id,
  a.code AS account_code,
  a.name AS account_name,
  a.type AS account_type,
  a.parent_account_id,
  ji.contact_id,
  ji.description,
  ji.debit,
  ji.credit
FROM public.journal_items ji
JOIN public.journal_entries je ON je.id = ji.journal_entry_id
JOIN public.accounts a ON a.id = ji.account_id;

CREATE OR REPLACE FUNCTION public.rpc_trial_balance(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date,
  p_posted_only boolean DEFAULT true,
  p_include_closing boolean DEFAULT true
)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  parent_account_id uuid,
  level int,
  opening_debit numeric,
  opening_credit numeric,
  period_debit numeric,
  period_credit numeric,
  closing_debit numeric,
  closing_credit numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH RECURSIVE
  authz AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
    ) AS ok
  ),
  acct AS (
    SELECT id, organization_id, code, name, type, parent_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
  ),
  roots AS (
    SELECT id, parent_account_id, code, name, type, 0 AS level, (code) AS sort_key
    FROM acct
    WHERE parent_account_id IS NULL
    UNION ALL
    SELECT a.id, a.parent_account_id, a.code, a.name, a.type, r.level + 1,
           (r.sort_key || '/' || a.code) AS sort_key
    FROM acct a
    JOIN roots r ON a.parent_account_id = r.id
  ),
  closure AS (
    SELECT id AS ancestor_id, id AS account_id
    FROM acct
    UNION ALL
    SELECT c.ancestor_id, a.id
    FROM closure c
    JOIN acct a ON a.parent_account_id = c.account_id
  ),
  filtered_items AS (
    SELECT
      ji.account_id,
      je.entry_date,
      je.status,
      je.is_closing,
      ji.debit,
      ji.credit
    FROM public.journal_items ji
    JOIN public.journal_entries je ON je.id = ji.journal_entry_id
    WHERE ji.organization_id = p_organization_id
      AND (NOT p_posted_only OR je.status = 'posted')
      AND (p_include_closing OR je.is_closing = false)
      AND je.status <> 'void'
  ),
  opening AS (
    SELECT
      c.ancestor_id,
      COALESCE(SUM(fi.debit), 0) AS debit,
      COALESCE(SUM(fi.credit), 0) AS credit
    FROM closure c
    LEFT JOIN filtered_items fi
      ON fi.account_id = c.account_id
     AND fi.entry_date < p_start_date
    GROUP BY c.ancestor_id
  ),
  period AS (
    SELECT
      c.ancestor_id,
      COALESCE(SUM(fi.debit), 0) AS debit,
      COALESCE(SUM(fi.credit), 0) AS credit
    FROM closure c
    LEFT JOIN filtered_items fi
      ON fi.account_id = c.account_id
     AND fi.entry_date >= p_start_date
     AND fi.entry_date <= p_end_date
    GROUP BY c.ancestor_id
  )
SELECT
  r.id AS account_id,
  r.code AS account_code,
  r.name AS account_name,
  r.type AS account_type,
  r.parent_account_id,
  r.level,
  o.debit AS opening_debit,
  o.credit AS opening_credit,
  p.debit AS period_debit,
  p.credit AS period_credit,
  CASE
    WHEN r.type IN ('asset','expense') THEN GREATEST((o.debit + p.debit) - (o.credit + p.credit), 0)
    ELSE GREATEST((o.debit + p.debit) - (o.credit + p.credit), 0)
  END AS closing_debit,
  CASE
    WHEN r.type IN ('asset','expense') THEN GREATEST((o.credit + p.credit) - (o.debit + p.debit), 0)
    ELSE GREATEST((o.credit + p.credit) - (o.debit + p.debit), 0)
  END AS closing_credit
FROM roots r
JOIN opening o ON o.ancestor_id = r.id
JOIN period p ON p.ancestor_id = r.id
JOIN authz z ON z.ok
ORDER BY
  CASE r.type
    WHEN 'asset' THEN 1
    WHEN 'liability' THEN 2
    WHEN 'equity' THEN 3
    WHEN 'income' THEN 4
    WHEN 'expense' THEN 5
    ELSE 9
  END,
  r.sort_key;
$$;

CREATE OR REPLACE FUNCTION public.rpc_pnl(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date,
  p_posted_only boolean DEFAULT true,
  p_include_closing boolean DEFAULT false
)
RETURNS TABLE (
  section text,
  account_id uuid,
  account_code text,
  account_name text,
  parent_account_id uuid,
  level int,
  amount numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH RECURSIVE
  authz AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = p_organization_id
        AND m.user_id = auth.uid()
    ) AS ok
  ),
  acct AS (
    SELECT id, code, name, type, parent_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
      AND type IN ('income','expense')
  ),
  roots AS (
    SELECT id, parent_account_id, code, name, type, 0 AS level, (code) AS sort_key
    FROM acct
    WHERE parent_account_id IS NULL
    UNION ALL
    SELECT a.id, a.parent_account_id, a.code, a.name, a.type, r.level + 1,
           (r.sort_key || '/' || a.code) AS sort_key
    FROM acct a
    JOIN roots r ON a.parent_account_id = r.id
  ),
  closure AS (
    SELECT id AS ancestor_id, id AS account_id
    FROM acct
    UNION ALL
    SELECT c.ancestor_id, a.id
    FROM closure c
    JOIN acct a ON a.parent_account_id = c.account_id
  ),
  filtered_items AS (
    SELECT
      ji.account_id,
      je.entry_date,
      je.status,
      je.is_closing,
      ji.debit,
      ji.credit
    FROM public.journal_items ji
    JOIN public.journal_entries je ON je.id = ji.journal_entry_id
    WHERE ji.organization_id = p_organization_id
      AND (NOT p_posted_only OR je.status = 'posted')
      AND (p_include_closing OR je.is_closing = false)
      AND je.status <> 'void'
      AND je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
  ),
  base_amount AS (
    SELECT
      c.ancestor_id,
      SUM(fi.debit) AS debit,
      SUM(fi.credit) AS credit
    FROM closure c
    LEFT JOIN filtered_items fi ON fi.account_id = c.account_id
    GROUP BY c.ancestor_id
  )
SELECT
  CASE WHEN r.type = 'income' THEN 'revenue' ELSE 'expense' END AS section,
  r.id AS account_id,
  r.code AS account_code,
  r.name AS account_name,
  r.parent_account_id,
  r.level,
  CASE
    WHEN r.type = 'income' THEN COALESCE(b.credit,0) - COALESCE(b.debit,0)
    ELSE COALESCE(b.debit,0) - COALESCE(b.credit,0)
  END AS amount
FROM roots r
LEFT JOIN base_amount b ON b.ancestor_id = r.id
JOIN authz z ON z.ok
ORDER BY
  CASE r.type WHEN 'income' THEN 1 ELSE 2 END,
  r.sort_key;
$$;

CREATE OR REPLACE FUNCTION public.rpc_exec_dashboard_trends(
  p_organization_id uuid,
  p_end_month date DEFAULT current_date
)
RETURNS TABLE (
  month text,
  revenue numeric,
  expense numeric,
  net_profit numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
authz AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
  ) AS ok
),
months AS (
  SELECT (date_trunc('month', p_end_month)::date - (g.i || ' months')::interval)::date AS month_start
  FROM generate_series(0, 5) AS g(i)
),
periods AS (
  SELECT month_start, (month_start + interval '1 month - 1 day')::date AS month_end
  FROM months
)
SELECT
  to_char(p.month_start, 'YYYY-MM') AS month,
  COALESCE(SUM(CASE WHEN a.type = 'income' THEN (ji.credit - ji.debit) ELSE 0 END),0) AS revenue,
  COALESCE(SUM(CASE WHEN a.type = 'expense' THEN (ji.debit - ji.credit) ELSE 0 END),0) AS expense,
  COALESCE(SUM(CASE WHEN a.type = 'income' THEN (ji.credit - ji.debit) ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN a.type = 'expense' THEN (ji.debit - ji.credit) ELSE 0 END),0) AS net_profit
FROM periods p
JOIN authz z ON z.ok
LEFT JOIN public.journal_entries je
  ON je.organization_id = p_organization_id
 AND je.status = 'posted'
 AND je.entry_date >= p.month_start
 AND je.entry_date <= p.month_end
LEFT JOIN public.journal_items ji ON ji.journal_entry_id = je.id
LEFT JOIN public.accounts a ON a.id = ji.account_id
GROUP BY p.month_start
ORDER BY p.month_start;
$$;

CREATE OR REPLACE FUNCTION public.rpc_exec_dashboard_kpis(
  p_organization_id uuid,
  p_month date DEFAULT current_date
)
RETURNS TABLE (
  revenue numeric,
  expense numeric,
  net_profit numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
authz AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
  ) AS ok
),
bounds AS (
  SELECT date_trunc('month', p_month)::date AS s, (date_trunc('month', p_month) + interval '1 month - 1 day')::date AS e
)
SELECT
  COALESCE(SUM(CASE WHEN a.type = 'income' THEN (ji.credit - ji.debit) ELSE 0 END),0) AS revenue,
  COALESCE(SUM(CASE WHEN a.type = 'expense' THEN (ji.debit - ji.credit) ELSE 0 END),0) AS expense,
  COALESCE(SUM(CASE WHEN a.type = 'income' THEN (ji.credit - ji.debit) ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN a.type = 'expense' THEN (ji.debit - ji.credit) ELSE 0 END),0) AS net_profit
FROM bounds b
JOIN authz z ON z.ok
JOIN public.journal_entries je
  ON je.organization_id = p_organization_id
 AND je.status = 'posted'
 AND je.entry_date >= b.s
 AND je.entry_date <= b.e
JOIN public.journal_items ji ON ji.journal_entry_id = je.id
JOIN public.accounts a ON a.id = ji.account_id;
$$;

CREATE OR REPLACE FUNCTION public.rpc_top_expenses(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  account_id uuid,
  label text,
  amount numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH authz AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
  ) AS ok
)
SELECT
  a.id AS account_id,
  (a.code || ' ' || a.name) AS label,
  SUM(ji.debit - ji.credit) AS amount
FROM public.journal_entries je
JOIN authz z ON z.ok
JOIN public.journal_items ji ON ji.journal_entry_id = je.id
JOIN public.accounts a ON a.id = ji.account_id
WHERE je.organization_id = p_organization_id
  AND je.status = 'posted'
  AND je.entry_date >= p_start_date
  AND je.entry_date <= p_end_date
  AND a.type = 'expense'
GROUP BY a.id, a.code, a.name
ORDER BY amount DESC
LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.rpc_receivable_aging(
  p_organization_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS TABLE (
  bucket text,
  count int,
  amount numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
authz AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
  ) AS ok
),
base AS (
  SELECT
    CASE
      WHEN status = 'draft' THEN 'draft'
      WHEN status IN ('paid','void') THEN 'closed'
      WHEN due_date IS NOT NULL AND due_date < p_as_of THEN 'overdue'
      WHEN due_date IS NOT NULL AND due_date <= (p_as_of + interval '7 days')::date THEN 'due_soon'
      ELSE 'open'
    END AS bucket,
    total_amount
  FROM public.invoices
  WHERE organization_id = p_organization_id
    AND status <> 'void'
)
SELECT bucket, COUNT(*)::int AS count, COALESCE(SUM(total_amount),0) AS amount
FROM base
JOIN authz z ON z.ok
WHERE bucket <> 'closed'
GROUP BY bucket
ORDER BY
  CASE bucket WHEN 'overdue' THEN 1 WHEN 'due_soon' THEN 2 WHEN 'open' THEN 3 WHEN 'draft' THEN 4 ELSE 9 END;
$$;

CREATE OR REPLACE VIEW public.vw_tax_output_vat AS
SELECT
  i.organization_id,
  i.issue_date,
  i.invoice_number,
  c.name AS customer_name,
  c.tax_id AS customer_tax_id,
  i.sub_total AS amount,
  i.vat_amount
FROM public.invoices i
JOIN public.contacts c ON c.id = i.contact_id
WHERE i.vat_amount > 0
  AND i.status <> 'void';

CREATE OR REPLACE FUNCTION public.rpc_wht_summary(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  count int,
  total_withholding numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH authz AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
  ) AS ok
)
SELECT
  COUNT(*)::int AS count,
  COALESCE(SUM(withholding_tax),0) AS total_withholding
FROM public.invoices
JOIN authz z ON z.ok
WHERE organization_id = p_organization_id
  AND withholding_tax IS NOT NULL
  AND status <> 'void'
  AND issue_date >= p_start_date
  AND issue_date <= p_end_date;
$$;

REVOKE ALL ON FUNCTION public.rpc_trial_balance(uuid, date, date, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_trial_balance(uuid, date, date, boolean, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_trial_balance(uuid, date, date, boolean, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_pnl(uuid, date, date, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_pnl(uuid, date, date, boolean, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_pnl(uuid, date, date, boolean, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_exec_dashboard_trends(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_exec_dashboard_trends(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_exec_dashboard_trends(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_exec_dashboard_kpis(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_exec_dashboard_kpis(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_exec_dashboard_kpis(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_top_expenses(uuid, date, date, int) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_top_expenses(uuid, date, date, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_top_expenses(uuid, date, date, int) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_receivable_aging(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_receivable_aging(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_receivable_aging(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_wht_summary(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_wht_summary(uuid, date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_wht_summary(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
