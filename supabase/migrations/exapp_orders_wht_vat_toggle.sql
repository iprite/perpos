BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS include_vat BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wht_rate NUMERIC(5,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE public.orders
SET
  include_vat = CASE WHEN coalesce(vat_rate, 0) > 0 THEN true ELSE false END,
  wht_rate = CASE WHEN coalesce(wht_rate, 0) > 0 THEN wht_rate ELSE 3 END,
  wht_amount = ROUND(GREATEST(0, coalesce(subtotal, 0) - coalesce(discount, 0)) * (CASE WHEN coalesce(wht_rate, 0) > 0 THEN wht_rate ELSE 3 END) / 100.0, 2),
  vat_rate = CASE WHEN coalesce(vat_rate, 0) > 0 THEN 7 ELSE 0 END,
  vat_amount = ROUND(GREATEST(0, coalesce(subtotal, 0) - coalesce(discount, 0)) * (CASE WHEN coalesce(vat_rate, 0) > 0 THEN 7 ELSE 0 END) / 100.0, 2),
  total = ROUND(GREATEST(0, coalesce(subtotal, 0) - coalesce(discount, 0)) + ROUND(GREATEST(0, coalesce(subtotal, 0) - coalesce(discount, 0)) * (CASE WHEN coalesce(vat_rate, 0) > 0 THEN 7 ELSE 0 END) / 100.0, 2) - ROUND(GREATEST(0, coalesce(subtotal, 0) - coalesce(discount, 0)) * (CASE WHEN coalesce(wht_rate, 0) > 0 THEN wht_rate ELSE 3 END) / 100.0, 2), 2)
WHERE true;

NOTIFY pgrst, 'reload config';

COMMIT;

