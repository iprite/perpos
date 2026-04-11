BEGIN;

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
  v_note := 'ชำระงวดที่ ' || NEW.installment_no::text;
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

UPDATE public.payment_transactions t
SET note = 'ชำระงวดที่ ' || op.installment_no::text
FROM public.order_payments op
WHERE t.source_table = 'order_payments'
  AND t.source_id = op.id;

NOTIFY pgrst, 'reload config';

COMMIT;
