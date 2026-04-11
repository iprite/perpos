BEGIN;

WITH rep_src AS (
  SELECT id
  FROM public.profiles
  WHERE role = 'representative'
  ORDER BY created_at DESC
  LIMIT 5
),
rep_fallback AS (
  SELECT id
  FROM public.profiles
  ORDER BY created_at DESC
  LIMIT 1
),
rep_ids AS (
  SELECT COALESCE(
    (SELECT array_agg(id) FROM rep_src),
    (SELECT array_agg(id) FROM rep_fallback)
  ) AS ids
),
seed_requests AS (
  INSERT INTO public.poa_requests (
    import_temp_id,
    representative_profile_id,
    status,
    worker_count,
    reason,
    employer_name,
    employer_address,
    employer_tax_id,
    employer_tel,
    employer_type,
    worker_male,
    worker_female,
    worker_nation,
    worker_type
  )
  SELECT
    'seed-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || gs::text,
    (SELECT (ids[1 + ((gs - 1) % array_length(ids, 1))]) FROM rep_ids),
    'submitted',
    1 + (gs % 6),
    'seed',
    'บริษัทเดโม่ POA ' || gs::text,
    'ที่อยู่เดโม่ ' || gs::text,
    lpad((1000000000000 + gs)::text, 13, '0'),
    '08000000' || lpad(gs::text, 2, '0'),
    'company',
    1 + (gs % 3),
    (gs % 2),
    'เมียนมา',
    'กรรมกร'
  FROM generate_series(1, 5) gs
  RETURNING id, worker_count
),
types AS (
  SELECT id, base_price
  FROM public.poa_request_types
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 2
),
seed_items AS (
  INSERT INTO public.poa_request_items (
    poa_request_id,
    poa_request_type_id,
    unit_price_per_worker,
    worker_count,
    total_price,
    payment_status
  )
  SELECT
    r.id,
    t.id,
    round(COALESCE(t.base_price, 0), 2),
    r.worker_count,
    round(COALESCE(t.base_price, 0) * r.worker_count, 2),
    'unpaid'
  FROM seed_requests r
  CROSS JOIN types t
  RETURNING poa_request_id
)
UPDATE public.poa_requests pr
SET
  unit_price = round(COALESCE(x.unit_price, 0), 2),
  total_price = round(COALESCE(x.total_price, 0), 2)
FROM (
  SELECT
    it.poa_request_id,
    max(it.unit_price_per_worker) AS unit_price,
    sum(it.total_price) AS total_price
  FROM public.poa_request_items it
  WHERE it.poa_request_id IN (SELECT id FROM seed_requests)
  GROUP BY it.poa_request_id
) x
WHERE pr.id = x.poa_request_id;

NOTIFY pgrst, 'reload config';

COMMIT;
