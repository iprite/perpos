BEGIN;

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
    my := to_char(COALESCE(NEW.created_at, NOW()), 'YYYYMM');

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

WITH converted AS (
  SELECT
    month_year AS old_key,
    substring(month_year from 3 for 4) || substring(month_year from 1 for 2) AS new_key,
    last_no
  FROM public.order_running_numbers
  WHERE month_year ~ '^(0[1-9]|1[0-2])\\d{4}$'
)
INSERT INTO public.order_running_numbers(month_year, last_no, updated_at)
SELECT new_key, last_no, NOW()
FROM converted
ON CONFLICT (month_year)
DO UPDATE SET last_no = greatest(public.order_running_numbers.last_no, EXCLUDED.last_no), updated_at = NOW();

DELETE FROM public.order_running_numbers
WHERE month_year IN (SELECT old_key FROM converted);

UPDATE public.orders
SET display_id =
  '#' ||
  substring(display_id from 4 for 4) ||
  substring(display_id from 2 for 2) ||
  substring(display_id from 8 for 4)
WHERE display_id ~ '^#\\d{10}$'
  AND (substring(display_id from 2 for 4))::int < 1900;

INSERT INTO public.order_running_numbers(month_year, last_no)
SELECT
  substring(display_id from 2 for 6) AS month_year,
  max((substring(display_id from 8))::int) AS last_no
FROM public.orders
WHERE display_id ~ '^#\\d{10}$'
GROUP BY substring(display_id from 2 for 6)
ON CONFLICT (month_year)
DO UPDATE SET last_no = greatest(public.order_running_numbers.last_no, EXCLUDED.last_no), updated_at = NOW();

NOTIFY pgrst, 'reload config';

COMMIT;
