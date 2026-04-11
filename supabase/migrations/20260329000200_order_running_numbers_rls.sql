BEGIN;

ALTER TABLE public.order_running_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_running_numbers_internal_all" ON public.order_running_numbers;
CREATE POLICY "order_running_numbers_internal_all" ON public.order_running_numbers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

CREATE OR REPLACE FUNCTION public.assign_order_display_id_and_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

NOTIFY pgrst, 'reload config';

COMMIT;
