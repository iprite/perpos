BEGIN;

WITH reps AS (
  SELECT
    p.id AS profile_id,
    p.email,
    (
      SELECT o.name
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.profile_id = p.id
      ORDER BY om.created_at DESC
      LIMIT 1
    ) AS company_name,
    row_number() OVER (ORDER BY p.created_at DESC, p.id) AS rn
  FROM public.profiles p
  WHERE p.role = 'representative'
  ORDER BY p.created_at DESC, p.id
  LIMIT 20
),
seed AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC, id) AS rn
  FROM public.poa_requests
  WHERE import_temp_id LIKE 'seed-%'
  ORDER BY created_at DESC, id
  LIMIT 5
),
picked AS (
  SELECT
    s.id AS poa_request_id,
    (SELECT r.profile_id FROM reps r WHERE r.rn = 1 + ((s.rn - 1) % greatest(1, (SELECT count(*) FROM reps))) LIMIT 1) AS profile_id,
    (SELECT r.email FROM reps r WHERE r.rn = 1 + ((s.rn - 1) % greatest(1, (SELECT count(*) FROM reps))) LIMIT 1) AS email,
    (SELECT r.company_name FROM reps r WHERE r.rn = 1 + ((s.rn - 1) % greatest(1, (SELECT count(*) FROM reps))) LIMIT 1) AS company_name
  FROM seed s
)
UPDATE public.poa_requests pr
SET
  representative_profile_id = COALESCE(picked.profile_id, pr.representative_profile_id),
  representative_name = COALESCE(picked.email, pr.representative_name),
  representative_company_name = COALESCE(picked.company_name, picked.email, pr.representative_company_name)
FROM picked
WHERE pr.id = picked.poa_request_id;

NOTIFY pgrst, 'reload config';

COMMIT;
