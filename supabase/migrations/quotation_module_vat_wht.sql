BEGIN;

ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS include_vat BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7;
ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS wht_rate NUMERIC(5,2) NOT NULL DEFAULT 3;
ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE public.sales_quotes
SET
  vat_amount = COALESCE(vat_amount, 0),
  wht_amount = COALESCE(wht_amount, 0),
  tax_total = COALESCE(vat_amount, tax_total, 0)
WHERE TRUE;

NOTIFY pgrst, 'reload config';

COMMIT;

