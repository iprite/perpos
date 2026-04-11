BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS province_th TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_province_th ON public.customers(province_th);

NOTIFY pgrst, 'reload config';

COMMIT;

