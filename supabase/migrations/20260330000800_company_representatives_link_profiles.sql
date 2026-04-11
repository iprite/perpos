BEGIN;

ALTER TABLE public.company_representatives
  ADD COLUMN IF NOT EXISTS profile_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_representatives_profile_id_fkey'
  ) THEN
    ALTER TABLE public.company_representatives
      ADD CONSTRAINT company_representatives_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_representatives_profile_id_unique
ON public.company_representatives(profile_id)
WHERE profile_id IS NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;
