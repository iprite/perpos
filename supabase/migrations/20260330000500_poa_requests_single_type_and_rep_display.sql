BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS representative_name TEXT,
  ADD COLUMN IF NOT EXISTS representative_company_name TEXT;

UPDATE public.poa_requests pr
SET representative_name = COALESCE(pr.representative_name, p.email)
FROM public.profiles p
WHERE pr.representative_profile_id = p.id
  AND pr.representative_name IS NULL;

WITH preferred AS (
  SELECT
    it.poa_request_id,
    (
      SELECT it2.id
      FROM public.poa_request_items it2
      WHERE it2.poa_request_id = it.poa_request_id
      ORDER BY (it2.payment_status = 'confirmed') DESC, it2.created_at ASC, it2.id ASC
      LIMIT 1
    ) AS keep_id
  FROM public.poa_request_items it
  GROUP BY it.poa_request_id
),
to_delete AS (
  SELECT it.id
  FROM public.poa_request_items it
  JOIN preferred p ON p.poa_request_id = it.poa_request_id
  WHERE it.id <> p.keep_id
    AND it.payment_status <> 'confirmed'
)
DELETE FROM public.poa_request_items
WHERE id IN (SELECT id FROM to_delete);

UPDATE public.poa_requests pr
SET
  poa_request_type_id = it.poa_request_type_id,
  unit_price = round(COALESCE(it.unit_price_per_worker, 0), 2),
  total_price = round(COALESCE(it.total_price, 0), 2)
FROM public.poa_request_items it
WHERE it.poa_request_id = pr.id;

NOTIFY pgrst, 'reload config';

COMMIT;
