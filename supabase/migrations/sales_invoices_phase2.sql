BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  invoice_number text,
  issue_date date NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','void')),
  sub_total numeric(18,2) NOT NULL DEFAULT 0,
  vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  withholding_tax numeric(18,2),
  notes text,
  posted_journal_entry_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_organization_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT invoices_contact_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT,
  CONSTRAINT invoices_posted_je_fk FOREIGN KEY (posted_journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  UNIQUE (organization_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  line_no int NOT NULL,
  product_name text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  vat_type text NOT NULL DEFAULT 'exclude' CHECK (vat_type IN ('include','exclude','none')),
  total_line_amount numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT invoice_items_invoice_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE,
  UNIQUE (invoice_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  organization_id uuid NOT NULL,
  yyyymm text NOT NULL,
  last_no int NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, yyyymm),
  CONSTRAINT invoice_number_counters_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_issue_date ON public.invoices(organization_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_contact ON public.invoices(organization_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id, line_no);

CREATE OR REPLACE FUNCTION public.set_invoice_items_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;
  NEW.organization_id := v_org;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_items_org_insert ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_org_insert
BEFORE INSERT ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.set_invoice_items_org();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_select ON public.invoices;
CREATE POLICY inv_select ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS inv_items_select ON public.invoice_items;
CREATE POLICY inv_items_select ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = invoice_items.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS inv_write_admin ON public.invoices;
CREATE POLICY inv_write_admin ON public.invoices
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS inv_items_write_admin ON public.invoice_items;
CREATE POLICY inv_items_write_admin ON public.invoice_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = invoice_items.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = invoice_items.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS inv_counters_none ON public.invoice_number_counters;
CREATE POLICY inv_counters_none ON public.invoice_number_counters
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_org uuid, p_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_yyyymm text := to_char(p_date, 'YYYYMM');
  v_next int;
BEGIN
  INSERT INTO public.invoice_number_counters (organization_id, yyyymm, last_no)
  VALUES (p_org, v_yyyymm, 0)
  ON CONFLICT (organization_id, yyyymm) DO NOTHING;

  UPDATE public.invoice_number_counters
  SET last_no = last_no + 1
  WHERE organization_id = p_org AND yyyymm = v_yyyymm
  RETURNING last_no INTO v_next;

  RETURN 'INV-' || v_yyyymm || '-' || lpad(v_next::text, 3, '0');
END;
$$;

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
      total_line_amount
    )
    VALUES (
      v_invoice_id,
      v_line_no,
      NULLIF(v_line->>'product_name', ''),
      v_qty,
      v_price,
      v_vat_type,
      round(v_line_total::numeric, 2)
    );
  END LOOP;

  IF p_status = 'sent' THEN
    SELECT id INTO v_ar_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND (
        code IN ('1100','1130','1200')
        OR name ILIKE '%ลูกหนี้%'
      )
    ORDER BY code
    LIMIT 1;

    SELECT id INTO v_vat_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND (
        code IN ('2100','2110')
        OR name ILIKE '%ภาษีขาย%'
      )
    ORDER BY code
    LIMIT 1;

    SELECT id INTO v_sales_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND (
        code IN ('4000','4100')
        OR name ILIKE '%ขาย%'
      )
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

    INSERT INTO public.journal_entries (organization_id, entry_date, memo, status, created_by, posted_at)
    VALUES (p_organization_id, p_issue_date, 'Invoice ' || v_invoice_number, 'posted', v_uid, now())
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

REVOKE ALL ON public.invoices FROM anon;
REVOKE ALL ON public.invoice_items FROM anon;
REVOKE ALL ON public.invoice_number_counters FROM anon;

REVOKE ALL ON public.invoices FROM authenticated;
REVOKE ALL ON public.invoice_items FROM authenticated;
REVOKE ALL ON public.invoice_number_counters FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;

GRANT ALL ON public.invoices TO service_role;
GRANT ALL ON public.invoice_items TO service_role;
GRANT ALL ON public.invoice_number_counters TO service_role;

REVOKE ALL ON FUNCTION public.next_invoice_number(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.next_invoice_number(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid, date) TO authenticated;
GRANT ALL ON FUNCTION public.next_invoice_number(uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.create_invoice_and_post(uuid, uuid, date, date, text, numeric, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_invoice_and_post(uuid, uuid, date, date, text, numeric, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_post(uuid, uuid, date, date, text, numeric, text, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_and_post(uuid, uuid, date, date, text, numeric, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

