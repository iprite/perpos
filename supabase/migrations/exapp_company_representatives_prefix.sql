BEGIN;

ALTER TABLE public.company_representatives
  ADD COLUMN IF NOT EXISTS prefix TEXT;

CREATE OR REPLACE FUNCTION public.set_company_representative_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.prefix := CASE
    WHEN NEW.gender = 'ชาย' THEN 'นาย'
    WHEN NEW.gender = 'หญิง' THEN 'นางสาว'
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_representative_prefix ON public.company_representatives;
CREATE TRIGGER trg_set_company_representative_prefix
BEFORE INSERT OR UPDATE OF gender
ON public.company_representatives
FOR EACH ROW
EXECUTE FUNCTION public.set_company_representative_prefix();

UPDATE public.company_representatives
SET prefix = CASE
  WHEN gender = 'ชาย' THEN 'นาย'
  WHEN gender = 'หญิง' THEN 'นางสาว'
  ELSE NULL
END,
updated_at = NOW();

NOTIFY pgrst, 'reload config';

COMMIT;

