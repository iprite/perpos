BEGIN;

ALTER TABLE public.poa_request_types
  DROP COLUMN IF EXISTS per_worker_price,
  DROP COLUMN IF EXISTS description;

NOTIFY pgrst, 'reload config';

COMMIT;

