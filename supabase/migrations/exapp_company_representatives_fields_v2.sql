BEGIN;

ALTER TABLE public.company_representatives
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS id_card_no TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS photo TEXT;

UPDATE public.company_representatives
SET
  photo = COALESCE(photo, NULLIF(card_image, '')),
  status = COALESCE(status, NULLIF(contract_status, ''), NULLIF(bt15_status, '')),
  updated_at = NOW()
WHERE photo IS NULL OR status IS NULL;

ALTER TABLE public.company_representatives
  DROP COLUMN IF EXISTS bt15_status,
  DROP COLUMN IF EXISTS contract_status,
  DROP COLUMN IF EXISTS extra_poa,
  DROP COLUMN IF EXISTS card_image,
  DROP COLUMN IF EXISTS files;

NOTIFY pgrst, 'reload config';

COMMIT;

