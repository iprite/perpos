BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_type_source_txn_date_desc ON public.payment_transactions (txn_type, source_type, txn_date DESC);

COMMIT;
