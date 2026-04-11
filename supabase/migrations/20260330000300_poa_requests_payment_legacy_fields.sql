BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_file_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_status_text TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;

