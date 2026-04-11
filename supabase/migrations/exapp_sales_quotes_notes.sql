BEGIN;

ALTER TABLE IF EXISTS public.sales_quotes
  ADD COLUMN IF NOT EXISTS notes TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;

