BEGIN;

UPDATE public.receipts r
SET
  status = 'voided',
  voided_at = NOW(),
  updated_at = NOW(),
  notes = CASE
    WHEN COALESCE(btrim(r.notes), '') = '' THEN 'auto-void: duplicate receipt for same invoice'
    ELSE r.notes || ' | auto-void: duplicate receipt for same invoice'
  END
WHERE r.id IN (
  SELECT x.id
  FROM (
    SELECT
      id,
      row_number() OVER (PARTITION BY invoice_id ORDER BY created_at ASC, id ASC) AS rn
    FROM public.receipts
    WHERE invoice_id IS NOT NULL
      AND status <> 'voided'
  ) x
  WHERE x.rn > 1
);

DROP INDEX IF EXISTS public.uq_receipts_invoice_active;
CREATE UNIQUE INDEX uq_receipts_invoice_active
  ON public.receipts(invoice_id)
  WHERE invoice_id IS NOT NULL AND status <> 'voided';

DROP INDEX IF EXISTS public.uq_receipt_items_receipt_sort_order;
CREATE UNIQUE INDEX uq_receipt_items_receipt_sort_order
  ON public.receipt_items(receipt_id, sort_order);

NOTIFY pgrst, 'reload config';

COMMIT;
