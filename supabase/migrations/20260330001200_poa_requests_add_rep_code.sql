BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS representative_rep_code TEXT;

CREATE INDEX IF NOT EXISTS idx_poa_requests_representative_rep_code
ON public.poa_requests (representative_rep_code);

UPDATE public.poa_requests pr
SET representative_rep_code = COALESCE(pr.representative_rep_code, cr.rep_code)
FROM public.company_representatives cr
WHERE pr.representative_profile_id = cr.profile_id
  AND cr.rep_code IS NOT NULL
  AND pr.representative_rep_code IS NULL;

NOTIFY pgrst, 'reload config';

COMMIT;
