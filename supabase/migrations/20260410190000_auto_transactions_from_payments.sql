BEGIN;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID;

DROP INDEX IF EXISTS public.idx_payment_transactions_source_unique;
CREATE UNIQUE INDEX idx_payment_transactions_source_unique
  ON public.payment_transactions (source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_source_table
  ON public.payment_transactions (source_table);

CREATE OR REPLACE FUNCTION public.sync_payment_transaction_from_order_payment()
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
BEGIN
  IF NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS NOT NULL AND NEW.amount IS NOT DISTINCT FROM OLD.amount THEN
    RETURN NEW;
  END IF;

  v_txn_date := NEW.confirmed_at::date;
  v_note := 'Order payment installment ' || NEW.installment_no::text;
  v_created_by := COALESCE(NEW.confirmed_by_profile_id, NEW.created_by_profile_id);

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
    NEW.order_id,
    NULL,
    'INCOME',
    'CUSTOMER',
    NEW.amount,
    'THB',
    v_txn_date,
    NULL,
    v_note,
    v_created_by,
    'order_payments',
    NEW.id
  )
  ON CONFLICT (source_table, source_id) DO UPDATE
  SET
    order_id = EXCLUDED.order_id,
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

DROP TRIGGER IF EXISTS trg_order_payments_sync_payment_transactions ON public.order_payments;
CREATE TRIGGER trg_order_payments_sync_payment_transactions
AFTER INSERT OR UPDATE OF confirmed_at, amount ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_transaction_from_order_payment();

CREATE OR REPLACE FUNCTION public.sync_payment_transaction_from_poa_item_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_req_id UUID;
  v_txn_date DATE;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status = 'confirmed' AND NEW.amount IS NOT DISTINCT FROM OLD.amount THEN
    RETURN NEW;
  END IF;

  SELECT it.poa_request_id
  INTO v_req_id
  FROM public.poa_request_items it
  WHERE it.id = NEW.poa_request_item_id
  LIMIT 1;

  v_txn_date := COALESCE(NEW.paid_date, NEW.created_at::date);

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
    v_req_id,
    'INCOME',
    'AGENT_POA',
    NEW.amount,
    'THB',
    v_txn_date,
    NEW.reference_no,
    'POA payment',
    NEW.created_by_profile_id,
    'poa_item_payments',
    NEW.id
  )
  ON CONFLICT (source_table, source_id) DO UPDATE
  SET
    poa_request_id = EXCLUDED.poa_request_id,
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

DROP TRIGGER IF EXISTS trg_poa_item_payments_sync_payment_transactions ON public.poa_item_payments;
CREATE TRIGGER trg_poa_item_payments_sync_payment_transactions
AFTER INSERT OR UPDATE OF status, amount, paid_date, reference_no ON public.poa_item_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_transaction_from_poa_item_payment();

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
SELECT
  op.order_id,
  NULL,
  'INCOME',
  'CUSTOMER',
  op.amount,
  'THB',
  op.confirmed_at::date,
  NULL,
  'Order payment installment ' || op.installment_no::text,
  COALESCE(op.confirmed_by_profile_id, op.created_by_profile_id),
  'order_payments',
  op.id
FROM public.order_payments op
WHERE op.confirmed_at IS NOT NULL
ON CONFLICT (source_table, source_id) DO NOTHING;

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
SELECT
  NULL,
  it.poa_request_id,
  'INCOME',
  'AGENT_POA',
  p.amount,
  'THB',
  COALESCE(p.paid_date, p.created_at::date),
  p.reference_no,
  'POA payment',
  p.created_by_profile_id,
  'poa_item_payments',
  p.id
FROM public.poa_item_payments p
JOIN public.poa_request_items it ON it.id = p.poa_request_item_id
WHERE p.status = 'confirmed'
ON CONFLICT (source_table, source_id) DO NOTHING;

NOTIFY pgrst, 'reload config';

COMMIT;
