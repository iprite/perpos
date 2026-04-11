BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS display_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poa_requests_display_id_unique
  ON public.poa_requests (display_id);

CREATE SEQUENCE IF NOT EXISTS public.poa_request_display_id_seq
  START 100001;

CREATE OR REPLACE FUNCTION public.assign_poa_display_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rep_code TEXT;
  seq BIGINT;
BEGIN
  IF NEW.representative_rep_code IS NULL OR length(trim(NEW.representative_rep_code)) = 0 THEN
    IF NEW.representative_import_temp_id IS NOT NULL AND length(trim(NEW.representative_import_temp_id)) > 0 THEN
      NEW.representative_rep_code := trim(NEW.representative_import_temp_id);
    ELSIF NEW.representative_profile_id IS NOT NULL THEN
      SELECT cr.rep_code
      INTO rep_code
      FROM public.company_representatives cr
      WHERE cr.profile_id = NEW.representative_profile_id
      LIMIT 1;

      IF rep_code IS NOT NULL AND length(trim(rep_code)) > 0 THEN
        NEW.representative_rep_code := trim(rep_code);
      END IF;
    END IF;
  END IF;

  IF NEW.display_id IS NULL OR length(trim(NEW.display_id)) = 0 THEN
    seq := nextval('public.poa_request_display_id_seq');
    NEW.display_id := 'POA' || seq::text || '-' || COALESCE(NULLIF(trim(NEW.representative_rep_code), ''), 'NA');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_poa_display_id ON public.poa_requests;
CREATE TRIGGER trg_assign_poa_display_id
BEFORE INSERT ON public.poa_requests
FOR EACH ROW
EXECUTE FUNCTION public.assign_poa_display_id();

UPDATE public.poa_requests pr
SET representative_rep_code = COALESCE(
  NULLIF(pr.representative_rep_code, ''),
  NULLIF(pr.representative_import_temp_id, ''),
  cr.rep_code
)
FROM public.company_representatives cr
WHERE pr.representative_rep_code IS NULL
  AND pr.representative_profile_id = cr.profile_id;

UPDATE public.poa_requests
SET display_id = 'POA' || nextval('public.poa_request_display_id_seq')::text || '-' || COALESCE(NULLIF(trim(representative_rep_code), ''), 'NA')
WHERE display_id IS NULL OR length(trim(display_id)) = 0;

NOTIFY pgrst, 'reload config';

COMMIT;
