BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS display_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT 'สำนักงานใหญ่';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_display_id_unique ON public.customers(display_id);

CREATE SEQUENCE IF NOT EXISTS public.customers_display_id_seq;

CREATE OR REPLACE FUNCTION public.assign_customer_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_no BIGINT;
BEGIN
  IF NEW.display_id IS NULL OR btrim(NEW.display_id) = '' THEN
    next_no := nextval('public.customers_display_id_seq');
    NEW.display_id := '#' || lpad(next_no::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_customer_display_id ON public.customers;
CREATE TRIGGER trg_assign_customer_display_id
BEFORE INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.assign_customer_display_id();

WITH ordered AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.customers
  WHERE display_id IS NULL OR btrim(display_id) = ''
)
UPDATE public.customers c
SET display_id = '#' || lpad(ordered.rn::text, 5, '0')
FROM ordered
WHERE c.id = ordered.id;

WITH max_no AS (
  SELECT COALESCE(max((substring(display_id from 2))::int), 0) AS m
  FROM public.customers
  WHERE display_id ~ '^#\\d{5}$'
)
SELECT setval(
  'public.customers_display_id_seq',
  greatest((SELECT m FROM max_no), 1),
  (SELECT m FROM max_no) > 0
);

NOTIFY pgrst, 'reload config';

COMMIT;
