BEGIN;

WITH mou_type AS (
  SELECT id, base_price
  FROM public.poa_request_types
  WHERE upper(trim(name)) = 'MOU'
  LIMIT 1
), ins AS (
  INSERT INTO public.poa_requests (
    import_temp_id,
    representative_profile_id,
    representative_rep_code,
    representative_name,
    representative_company_name,
    employer_name,
    employer_address,
    employer_tax_id,
    employer_tel,
    employer_type,
    worker_count,
    worker_male,
    worker_female,
    worker_nation,
    worker_type,
    poa_request_type_id,
    status
  )
  SELECT
    'seed-mou-001',
    NULL,
    'EXS-01',
    'นางสาว เนตรนภา ฤทธิเดช',
    'EXS-01',
    'บริษัทเดโม่ POA MOU',
    'ที่อยู่เดโม่ MOU',
    '1234567890123',
    '0800000000',
    'company',
    5,
    2,
    3,
    'เมียนมา',
    'กรรมกร',
    mou_type.id,
    'submitted'
  FROM mou_type
  ON CONFLICT (import_temp_id) DO NOTHING
  RETURNING id, poa_request_type_id
)
INSERT INTO public.poa_request_items (
  poa_request_id,
  poa_request_type_id,
  unit_price_per_worker,
  worker_count,
  total_price,
  payment_status
)
SELECT
  ins.id,
  ins.poa_request_type_id,
  mou_type.base_price,
  5,
  mou_type.base_price * 5,
  'unpaid'
FROM ins
JOIN mou_type ON mou_type.id = ins.poa_request_type_id
ON CONFLICT (poa_request_id, poa_request_type_id) DO NOTHING;

NOTIFY pgrst, 'reload config';

COMMIT;
