BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS display_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_id_unique ON public.orders(display_id);

CREATE TABLE IF NOT EXISTS public.order_running_numbers (
  month_year TEXT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.assign_order_display_id_and_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  NEW.paid_amount := round(COALESCE(NEW.paid_amount, 0), 2);

  IF NEW.display_id IS NULL OR btrim(NEW.display_id) = '' THEN
    my := to_char(COALESCE(NEW.created_at, NOW()), 'MMYYYY');

    INSERT INTO public.order_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.order_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.display_id := '#' || my || lpad(n::text, 4, '0');
  END IF;

  NEW.remaining_amount := greatest(0, round(COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0), 2));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_order_display_id_and_amounts ON public.orders;
CREATE TRIGGER trg_assign_order_display_id_and_amounts
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_display_id_and_amounts();

CREATE OR REPLACE FUNCTION public.recompute_order_payment_amounts(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  paid NUMERIC(12,2);
BEGIN
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO paid
  FROM public.order_payments
  WHERE order_id = target_order_id;

  UPDATE public.orders
  SET paid_amount = paid
  WHERE id = target_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_order_payments_recompute_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order_payment_amounts(OLD.order_id);
  ELSE
    PERFORM public.recompute_order_payment_amounts(NEW.order_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_recompute_orders ON public.order_payments;
CREATE TRIGGER trg_order_payments_recompute_orders
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_payments_recompute_orders();

WITH ranked AS (
  SELECT
    id,
    to_char(created_at, 'MMYYYY') AS my,
    row_number() OVER (PARTITION BY to_char(created_at, 'MMYYYY') ORDER BY created_at, id) AS rn
  FROM public.orders
  WHERE display_id IS NULL OR btrim(display_id) = ''
)
UPDATE public.orders o
SET display_id = '#' || ranked.my || lpad(ranked.rn::text, 4, '0')
FROM ranked
WHERE o.id = ranked.id;

INSERT INTO public.order_running_numbers(month_year, last_no)
SELECT
  to_char(created_at, 'MMYYYY') AS month_year,
  max((substring(display_id from 8))::int) AS last_no
FROM public.orders
WHERE display_id ~ '^#\\d{10}$'
GROUP BY to_char(created_at, 'MMYYYY')
ON CONFLICT (month_year)
DO UPDATE SET last_no = greatest(public.order_running_numbers.last_no, EXCLUDED.last_no), updated_at = NOW();

UPDATE public.orders o
SET paid_amount = round(COALESCE(p.paid, 0), 2)
FROM (
  SELECT order_id, sum(amount) AS paid
  FROM public.order_payments
  GROUP BY order_id
) p
WHERE o.id = p.order_id;

UPDATE public.orders
SET remaining_amount = greatest(0, round(COALESCE(total, 0) - COALESCE(paid_amount, 0), 2));

NOTIFY pgrst, 'reload config';

COMMIT;
