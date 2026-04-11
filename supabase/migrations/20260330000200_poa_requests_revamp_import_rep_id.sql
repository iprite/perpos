BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS representative_import_temp_id TEXT;

ALTER TABLE public.poa_requests
  ALTER COLUMN representative_profile_id DROP NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;

