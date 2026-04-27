BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_running_numbers (
  month_year TEXT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receipt_running_numbers (
  month_year TEXT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoice_running_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_running_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_running_numbers_internal_all" ON public.invoice_running_numbers;
CREATE POLICY "invoice_running_numbers_internal_all" ON public.invoice_running_numbers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "receipt_running_numbers_internal_all" ON public.receipt_running_numbers;
CREATE POLICY "receipt_running_numbers_internal_all" ON public.receipt_running_numbers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT ON public.invoice_running_numbers TO anon;
GRANT ALL PRIVILEGES ON public.invoice_running_numbers TO authenticated;
GRANT SELECT ON public.receipt_running_numbers TO anon;
GRANT ALL PRIVILEGES ON public.receipt_running_numbers TO authenticated;

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid_confirmed','cancelled')),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  installment_no SMALLINT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency TEXT NOT NULL DEFAULT 'THB',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  include_vat BOOLEAN NOT NULL DEFAULT TRUE,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  paid_confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_doc_no ON public.invoices(doc_no);
CREATE INDEX IF NOT EXISTS idx_invoices_status_issue_date ON public.invoices(status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);

DROP TRIGGER IF EXISTS trg_invoices_set_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_set_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  installment_no SMALLINT NOT NULL DEFAULT 1,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  slip_storage_provider TEXT NOT NULL DEFAULT 'supabase',
  slip_storage_bucket TEXT,
  slip_storage_path TEXT,
  slip_file_name TEXT,
  slip_mime_type TEXT,
  slip_size_bytes BIGINT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_payments_invoice_installment ON public.invoice_payments(invoice_id, installment_no);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON public.invoice_payments(invoice_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_internal_all" ON public.invoices;
CREATE POLICY "invoices_internal_all" ON public.invoices
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "invoice_items_internal_all" ON public.invoice_items;
CREATE POLICY "invoice_items_internal_all" ON public.invoice_items
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "invoice_payments_internal_all" ON public.invoice_payments;
CREATE POLICY "invoice_payments_internal_all" ON public.invoice_payments
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT ON public.invoices, public.invoice_items, public.invoice_payments TO anon;
GRANT ALL PRIVILEGES ON public.invoices, public.invoice_items, public.invoice_payments TO authenticated;

CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','voided')),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency TEXT NOT NULL DEFAULT 'THB',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  include_vat BOOLEAN NOT NULL DEFAULT TRUE,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_date DATE,
  payment_method TEXT,
  payment_ref TEXT,
  notes TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_receipts_doc_no ON public.receipts(doc_no);
CREATE INDEX IF NOT EXISTS idx_receipts_status_issue_date ON public.receipts(status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_customer_id ON public.receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice_id ON public.receipts(invoice_id);

DROP TRIGGER IF EXISTS trg_receipts_set_updated_at ON public.receipts;
CREATE TRIGGER trg_receipts_set_updated_at
BEFORE UPDATE ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_internal_all" ON public.receipts;
CREATE POLICY "receipts_internal_all" ON public.receipts
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "receipt_items_internal_all" ON public.receipt_items;
CREATE POLICY "receipt_items_internal_all" ON public.receipt_items
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT ON public.receipts, public.receipt_items TO anon;
GRANT ALL PRIVILEGES ON public.receipts, public.receipt_items TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_invoice_doc_no_on_issue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  IF NEW.status IN ('issued','paid_confirmed') AND (NEW.doc_no IS NULL OR btrim(NEW.doc_no) = '') THEN
    my := to_char(COALESCE(NEW.issue_date::timestamptz, NOW()), 'YYYYMM');

    INSERT INTO public.invoice_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.invoice_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.doc_no := 'IV-' || right(my, 4) || '/' || lpad(n::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_doc_no ON public.invoices;
CREATE TRIGGER trg_assign_invoice_doc_no
BEFORE INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.assign_invoice_doc_no_on_issue();

CREATE OR REPLACE FUNCTION public.assign_receipt_doc_no_on_issue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  IF NEW.status = 'issued' AND (NEW.doc_no IS NULL OR btrim(NEW.doc_no) = '') THEN
    my := to_char(COALESCE(NEW.issue_date::timestamptz, NOW()), 'YYYYMM');

    INSERT INTO public.receipt_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.receipt_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.doc_no := 'RT-' || right(my, 4) || '/' || lpad(n::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_receipt_doc_no ON public.receipts;
CREATE TRIGGER trg_assign_receipt_doc_no
BEFORE INSERT OR UPDATE OF status ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.assign_receipt_doc_no_on_issue();

CREATE OR REPLACE FUNCTION public.sync_payment_transaction_from_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_txn_date DATE;
  v_note TEXT;
  v_created_by UUID;
  v_ref TEXT;
BEGIN
  IF NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS NOT NULL AND NEW.amount IS NOT DISTINCT FROM OLD.amount THEN
    RETURN NEW;
  END IF;

  v_txn_date := NEW.confirmed_at::date;
  v_note := 'Invoice payment installment ' || NEW.installment_no::text;
  v_created_by := COALESCE(NEW.confirmed_by_profile_id, NEW.created_by_profile_id);

  SELECT doc_no
  INTO v_ref
  FROM public.invoices
  WHERE id = NEW.invoice_id
  LIMIT 1;

  INSERT INTO public.payment_transactions (
    order_id,
    poa_request_id,
    txn_type,
    source_type,
    amount,
    currency,
    txn_date,
    reference_no,
    note,
    created_by_profile_id,
    source_table,
    source_id
  )
  VALUES (
    NULL,
    NULL,
    'INCOME',
    'CUSTOMER',
    NEW.amount,
    'THB',
    v_txn_date,
    v_ref,
    v_note,
    v_created_by,
    'invoice_payments',
    NEW.id
  )
  ON CONFLICT (source_table, source_id) DO UPDATE
  SET
    txn_type = EXCLUDED.txn_type,
    source_type = EXCLUDED.source_type,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    txn_date = EXCLUDED.txn_date,
    reference_no = EXCLUDED.reference_no,
    note = EXCLUDED.note,
    created_by_profile_id = EXCLUDED.created_by_profile_id,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payments_sync_payment_transactions ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_sync_payment_transactions
AFTER INSERT OR UPDATE OF confirmed_at, amount ON public.invoice_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_transaction_from_invoice_payment();

NOTIFY pgrst, 'reload config';

COMMIT;

