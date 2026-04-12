BEGIN;

INSERT INTO public.payment_transactions (
  order_id,
  poa_request_id,
  txn_type,
  source_type,
  amount,
  currency,
  txn_date,
  reference_no,
  note,
  created_by_profile_id,
  source_table,
  source_id
)
SELECT
  NULL,
  pr.id,
  'INCOME',
  'AGENT_POA',
  pr.payment_amount,
  'THB',
  COALESCE(pr.payment_date, pr.created_at::date),
  NULL,
  'POA payment (legacy backfill)',
  NULL,
  'poa_requests',
  pr.id
FROM public.poa_requests pr
WHERE pr.payment_amount IS NOT NULL
  AND pr.payment_amount > 0
  AND pr.payment_status_text ILIKE '%ยืนยัน%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.poa_request_items it
    JOIN public.poa_item_payments p ON p.poa_request_item_id = it.id
    WHERE it.poa_request_id = pr.id
      AND p.status = 'confirmed'
  )
ON CONFLICT (source_table, source_id) DO UPDATE
SET
  poa_request_id = EXCLUDED.poa_request_id,
  txn_type = EXCLUDED.txn_type,
  source_type = EXCLUDED.source_type,
  amount = EXCLUDED.amount,
  currency = EXCLUDED.currency,
  txn_date = EXCLUDED.txn_date,
  reference_no = EXCLUDED.reference_no,
  note = EXCLUDED.note,
  created_by_profile_id = EXCLUDED.created_by_profile_id,
  updated_at = NOW();

NOTIFY pgrst, 'reload config';

COMMIT;

