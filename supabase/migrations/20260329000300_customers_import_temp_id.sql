BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS import_temp_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_import_temp_id_unique ON public.customers(import_temp_id);

NOTIFY pgrst, 'reload config';

COMMIT;
