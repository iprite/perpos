BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);

NOTIFY pgrst, 'reload config';

COMMIT;

