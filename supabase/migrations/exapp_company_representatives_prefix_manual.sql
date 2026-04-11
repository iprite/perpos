BEGIN;

DROP TRIGGER IF EXISTS trg_set_company_representative_prefix ON public.company_representatives;
DROP FUNCTION IF EXISTS public.set_company_representative_prefix();

UPDATE public.company_representatives
SET prefix = CASE
  WHEN prefix IS NOT NULL AND prefix <> '' THEN prefix
  WHEN gender = 'ชาย' THEN 'นาย'
  WHEN gender = 'หญิง' THEN 'นางสาว'
  ELSE NULL
END,
updated_at = NOW();

NOTIFY pgrst, 'reload config';

COMMIT;

