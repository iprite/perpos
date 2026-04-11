BEGIN;

WITH seed_ids AS (
  SELECT id
  FROM public.poa_requests
  WHERE import_temp_id LIKE 'seed-%'
),
del_payments AS (
  DELETE FROM public.poa_item_payments
  WHERE poa_request_item_id IN (
    SELECT it.id
    FROM public.poa_request_items it
    WHERE it.poa_request_id IN (SELECT id FROM seed_ids)
  )
  RETURNING 1
),
del_items AS (
  DELETE FROM public.poa_request_items
  WHERE poa_request_id IN (SELECT id FROM seed_ids)
  RETURNING 1
),
del_docs AS (
  DELETE FROM public.poa_documents
  WHERE poa_request_id IN (SELECT id FROM seed_ids)
  RETURNING 1
),
del_requests AS (
  DELETE FROM public.poa_requests
  WHERE id IN (SELECT id FROM seed_ids)
  RETURNING 1
),
rep_pool AS (
  SELECT
    cr.profile_id,
    cr.rep_code,
    cr.prefix,
    cr.first_name,
    cr.last_name,
    row_number() OVER (ORDER BY cr.created_at DESC, cr.id) AS rn,
    count(*) OVER () AS cnt
  FROM public.company_representatives cr
  WHERE cr.profile_id IS NOT NULL
),
rep_one AS (
  SELECT
    p.id AS profile_id,
    NULL::text AS rep_code,
    NULL::text AS prefix,
    NULL::text AS first_name,
    NULL::text AS last_name,
    1 AS rn,
    1 AS cnt
  FROM public.profiles p
  WHERE p.role = 'representative'
  ORDER BY p.created_at DESC
  LIMIT 1
),
rep AS (
  SELECT * FROM rep_pool
  UNION ALL
  SELECT * FROM rep_one
  WHERE NOT EXISTS (SELECT 1 FROM rep_pool)
),
type_one AS (
  SELECT id, base_price, name
  FROM public.poa_request_types
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1
),
seed_requests AS (
  INSERT INTO public.poa_requests (
    import_temp_id,
    representative_profile_id,
    representative_name,
    representative_company_name,
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
    worker_type,
    poa_request_type_id,
    unit_price,
    total_price
  )
  SELECT
    'seed-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || gs::text,
    (SELECT r.profile_id FROM rep r WHERE r.rn = 1 + ((gs - 1) % greatest(1, (SELECT max(cnt) FROM rep))) LIMIT 1),
    (SELECT trim(concat_ws(' ', nullif(coalesce(r.prefix,''),''), nullif(coalesce(r.first_name,''),''), nullif(coalesce(r.last_name,''),''))) FROM rep r WHERE r.rn = 1 + ((gs - 1) % greatest(1, (SELECT max(cnt) FROM rep))) LIMIT 1),
    (SELECT coalesce(nullif(r.rep_code,''), 'ตัวแทน') FROM rep r WHERE r.rn = 1 + ((gs - 1) % greatest(1, (SELECT max(cnt) FROM rep))) LIMIT 1),
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
    'กรรมกร',
    (SELECT id FROM type_one),
    round(COALESCE((SELECT base_price FROM type_one), 0), 2),
    round(COALESCE((SELECT base_price FROM type_one), 0) * (1 + (gs % 6)), 2)
  FROM generate_series(1, 5) gs
  RETURNING id, worker_count
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
    (SELECT id FROM type_one),
    round(COALESCE((SELECT base_price FROM type_one), 0), 2),
    r.worker_count,
    round(COALESCE((SELECT base_price FROM type_one), 0) * r.worker_count, 2),
    'unpaid'
  FROM seed_requests r
  RETURNING poa_request_id
)
SELECT 1;

NOTIFY pgrst, 'reload config';

COMMIT;
