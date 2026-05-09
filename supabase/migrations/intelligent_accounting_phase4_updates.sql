BEGIN;

CREATE OR REPLACE FUNCTION public.create_invoice_and_post(
  p_organization_id uuid,
  p_contact_id uuid,
  p_issue_date date,
  p_due_date date,
  p_status text,
  p_withholding_tax numeric,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_sub_total numeric(18,2) := 0;
  v_vat_amount numeric(18,2) := 0;
  v_total numeric(18,2) := 0;
  v_line_no int := 0;
  v_line jsonb;
  v_qty numeric(18,4);
  v_price numeric(18,2);
  v_vat_type text;
  v_base numeric(18,6);
  v_vat numeric(18,6);
  v_line_total numeric(18,6);
  v_inv_item_id uuid;
  v_je_id uuid;
  v_ar_account_id uuid;
  v_vat_account_id uuid;
  v_sales_account_id uuid;
  v_jline int := 1;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = p_organization_id
    AND m.user_id = v_uid
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not_member';
  END IF;
  IF v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  IF p_status NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF p_status = 'sent' THEN
    v_invoice_number := public.next_invoice_number(p_organization_id, p_issue_date);
  ELSE
    v_invoice_number := NULL;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_no := v_line_no + 1;
    v_qty := COALESCE(NULLIF(v_line->>'quantity', '')::numeric, 0);
    v_price := COALESCE(NULLIF(v_line->>'unit_price', '')::numeric, 0);
    v_vat_type := COALESCE(NULLIF(lower(v_line->>'vat_type'), ''), 'exclude');
    IF v_qty <= 0 OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid_line';
    END IF;
    IF v_vat_type NOT IN ('include','exclude','none') THEN
      RAISE EXCEPTION 'invalid_vat_type';
    END IF;

    IF v_vat_type = 'include' THEN
      v_line_total := v_qty * v_price;
      v_base := v_line_total / 1.07;
      v_vat := v_line_total - v_base;
    ELSIF v_vat_type = 'exclude' THEN
      v_base := v_qty * v_price;
      v_vat := v_base * 0.07;
      v_line_total := v_base + v_vat;
    ELSE
      v_base := v_qty * v_price;
      v_vat := 0;
      v_line_total := v_base;
    END IF;

    v_sub_total := v_sub_total + round(v_base::numeric, 2);
    v_vat_amount := v_vat_amount + round(v_vat::numeric, 2);
    v_total := v_total + round(v_line_total::numeric, 2);
  END LOOP;

  INSERT INTO public.invoices (
    organization_id,
    contact_id,
    invoice_number,
    issue_date,
    due_date,
    status,
    sub_total,
    vat_amount,
    total_amount,
    withholding_tax,
    notes,
    created_by
  )
  VALUES (
    p_organization_id,
    p_contact_id,
    v_invoice_number,
    p_issue_date,
    p_due_date,
    p_status,
    round(v_sub_total, 2),
    round(v_vat_amount, 2),
    round(v_total, 2),
    p_withholding_tax,
    NULLIF(p_notes, ''),
    v_uid
  )
  RETURNING id INTO v_invoice_id;

  v_line_no := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_no := v_line_no + 1;
    v_qty := COALESCE(NULLIF(v_line->>'quantity', '')::numeric, 0);
    v_price := COALESCE(NULLIF(v_line->>'unit_price', '')::numeric, 0);
    v_vat_type := COALESCE(NULLIF(lower(v_line->>'vat_type'), ''), 'exclude');
    v_inv_item_id := NULLIF(v_line->>'inventory_item_id','')::uuid;

    IF v_vat_type = 'include' THEN
      v_line_total := v_qty * v_price;
    ELSIF v_vat_type = 'exclude' THEN
      v_line_total := (v_qty * v_price) * 1.07;
    ELSE
      v_line_total := v_qty * v_price;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id,
      line_no,
      product_name,
      quantity,
      unit_price,
      vat_type,
      total_line_amount,
      inventory_item_id
    )
    VALUES (
      v_invoice_id,
      v_line_no,
      NULLIF(v_line->>'product_name', ''),
      v_qty,
      v_price,
      v_vat_type,
      round(v_line_total::numeric, 2),
      v_inv_item_id
    );
  END LOOP;

  IF p_status = 'sent' THEN
    SELECT id INTO v_ar_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND (code IN ('1100','1130','1200') OR name ILIKE '%ลูกหนี้%')
    ORDER BY code
    LIMIT 1;

    SELECT id INTO v_vat_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND (code IN ('2100','2110') OR name ILIKE '%ภาษีขาย%')
    ORDER BY code
    LIMIT 1;

    SELECT id INTO v_sales_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND (code IN ('4000','4100') OR name ILIKE '%ขาย%')
    ORDER BY code
    LIMIT 1;

    IF v_ar_account_id IS NULL THEN
      RAISE EXCEPTION 'missing_ar_account';
    END IF;
    IF v_sales_account_id IS NULL THEN
      RAISE EXCEPTION 'missing_sales_account';
    END IF;
    IF round(v_vat_amount,2) > 0 AND v_vat_account_id IS NULL THEN
      RAISE EXCEPTION 'missing_vat_output_account';
    END IF;

    INSERT INTO public.journal_entries (organization_id, entry_date, memo, status, created_by, posted_at, source_type, source_id)
    VALUES (p_organization_id, p_issue_date, 'Invoice ' || v_invoice_number, 'posted', v_uid, now(), 'invoice', v_invoice_id)
    RETURNING id INTO v_je_id;

    INSERT INTO public.journal_items (organization_id, journal_entry_id, line_no, account_id, contact_id, description, debit, credit)
    VALUES (p_organization_id, v_je_id, v_jline, v_ar_account_id, p_contact_id, 'A/R ' || v_invoice_number, round(v_total,2), 0);
    v_jline := v_jline + 1;

    INSERT INTO public.journal_items (organization_id, journal_entry_id, line_no, account_id, contact_id, description, debit, credit)
    VALUES (p_organization_id, v_je_id, v_jline, v_sales_account_id, p_contact_id, 'Sales Revenue ' || v_invoice_number, 0, round(v_sub_total,2));
    v_jline := v_jline + 1;

    IF round(v_vat_amount,2) > 0 THEN
      INSERT INTO public.journal_items (organization_id, journal_entry_id, line_no, account_id, contact_id, description, debit, credit)
      VALUES (p_organization_id, v_je_id, v_jline, v_vat_account_id, p_contact_id, 'Output VAT ' || v_invoice_number, 0, round(v_vat_amount,2));
    END IF;

    UPDATE public.invoices
    SET posted_journal_entry_id = v_je_id
    WHERE id = v_invoice_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_post_wht_liability(
  p_wht_id uuid,
  p_debit_account_id uuid,
  p_wht_payable_account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wht public.wht_certificates;
  v_role text;
  v_je_id uuid;
  v_line int := 1;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_wht FROM public.wht_certificates WHERE id = p_wht_id;
  IF v_wht.id IS NULL THEN RAISE EXCEPTION 'wht_not_found'; END IF;

  SELECT m.role INTO v_role
  FROM public.organization_members m
  WHERE m.organization_id = v_wht.organization_id AND m.user_id = v_uid
  LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_wht.status <> 'issued' THEN RAISE EXCEPTION 'wht_not_issued'; END IF;
  IF v_wht.posted_journal_entry_id IS NOT NULL THEN RETURN v_wht.posted_journal_entry_id; END IF;

  INSERT INTO public.journal_entries (organization_id, entry_date, memo, status, created_by, posted_at, source_type, source_id)
  VALUES (v_wht.organization_id, v_wht.wht_date, 'WHT ' || coalesce(v_wht.certificate_no,''), 'posted', v_uid, now(), 'wht', v_wht.id)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_items (organization_id, journal_entry_id, line_no, account_id, description, debit, credit)
  VALUES (v_wht.organization_id, v_je_id, v_line, p_debit_account_id, 'WHT Liability (debit side)', round(v_wht.wht_amount,2), 0);
  v_line := v_line + 1;

  INSERT INTO public.journal_items (organization_id, journal_entry_id, line_no, account_id, description, debit, credit)
  VALUES (v_wht.organization_id, v_je_id, v_line, p_wht_payable_account_id, 'WHT Payable', 0, round(v_wht.wht_amount,2));

  UPDATE public.wht_certificates
  SET posted_journal_entry_id = v_je_id,
      updated_at = now()
  WHERE id = v_wht.id;

  RETURN v_je_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_suggest_reconciliation(
  p_organization_id uuid,
  p_bank_line_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  journal_entry_id uuid,
  entry_date date,
  memo text,
  matched_amount numeric,
  day_diff int
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
bl AS (
  SELECT txn_date, amount, direction
  FROM public.bank_lines
  WHERE id = p_bank_line_id AND organization_id = p_organization_id
),
target AS (
  SELECT
    txn_date,
    amount,
    direction,
    (txn_date - interval '3 days')::date AS s,
    (txn_date + interval '3 days')::date AS e
  FROM bl
)
SELECT
  je.id AS journal_entry_id,
  je.entry_date,
  je.memo,
  t.amount AS matched_amount,
  abs((je.entry_date - t.txn_date))::int AS day_diff
FROM authz z
JOIN target t ON z.ok
JOIN public.journal_entries je
  ON je.organization_id = p_organization_id
 AND je.status = 'posted'
 AND je.entry_date >= t.s
 AND je.entry_date <= t.e
LEFT JOIN public.reconciliation_matches rm
  ON rm.journal_entry_id = je.id AND rm.status = 'confirmed'
JOIN public.journal_items ji
  ON ji.journal_entry_id = je.id
WHERE rm.id IS NULL
  AND (
    (t.direction = 'out' AND ji.credit = t.amount) OR
    (t.direction = 'in' AND ji.debit = t.amount)
  )
GROUP BY je.id, je.entry_date, je.memo, t.amount, t.txn_date
ORDER BY day_diff ASC, je.entry_date DESC
LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.rpc_post_wht_liability(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_post_wht_liability(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_post_wht_liability(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_suggest_reconciliation(uuid, uuid, int) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_suggest_reconciliation(uuid, uuid, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_suggest_reconciliation(uuid, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

