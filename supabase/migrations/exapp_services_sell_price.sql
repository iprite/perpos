BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_price_detail TEXT;

UPDATE public.services
SET sell_price = GREATEST(sell_price, cost)
WHERE cost IS NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;
