BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS wht_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS wht_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE public.invoices
SET
  wht_rate = COALESCE(wht_rate, 0),
  wht_amount = COALESCE(wht_amount, 0)
WHERE TRUE;

UPDATE public.receipts
SET
  wht_rate = COALESCE(wht_rate, 0),
  wht_amount = COALESCE(wht_amount, 0)
WHERE TRUE;

NOTIFY pgrst, 'reload schema';

COMMIT;

