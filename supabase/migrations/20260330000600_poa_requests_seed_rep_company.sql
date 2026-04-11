BEGIN;

WITH seed AS (
  SELECT id,
         row_number() OVER (ORDER BY created_at DESC, id) AS rn
  FROM public.poa_requests
  WHERE import_temp_id LIKE 'seed-%'
  ORDER BY created_at DESC, id
  LIMIT 5
)
UPDATE public.poa_requests pr
SET
  representative_company_name = COALESCE(pr.representative_company_name, 'บริษัทตัวแทนเดโม่ ' || seed.rn::text),
  representative_name = COALESCE(pr.representative_name, 'ตัวแทนเดโม่ ' || seed.rn::text)
FROM seed
WHERE pr.id = seed.id;

NOTIFY pgrst, 'reload config';

COMMIT;
