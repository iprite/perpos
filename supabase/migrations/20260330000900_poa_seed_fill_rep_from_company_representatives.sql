BEGIN;

WITH seed AS (
  SELECT id,
         representative_profile_id
  FROM public.poa_requests
  WHERE import_temp_id LIKE 'seed-%'
  ORDER BY created_at DESC, id
  LIMIT 5
),
rep AS (
  SELECT
    cr.profile_id,
    cr.rep_code,
    cr.prefix,
    cr.first_name,
    cr.last_name
  FROM public.company_representatives cr
  WHERE cr.profile_id IS NOT NULL
)
UPDATE public.poa_requests pr
SET
  representative_name = trim(concat_ws(' ', coalesce(rep.prefix,''), coalesce(rep.first_name,''), coalesce(rep.last_name,''))),
  representative_company_name = coalesce(rep.rep_code, pr.representative_company_name)
FROM seed
JOIN rep ON rep.profile_id = seed.representative_profile_id
WHERE pr.id = seed.id;

NOTIFY pgrst, 'reload config';

COMMIT;
