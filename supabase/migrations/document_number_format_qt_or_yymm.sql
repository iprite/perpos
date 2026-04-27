BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_running_numbers (
  month_year TEXT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quote_running_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_running_numbers_internal_all" ON public.quote_running_numbers;
CREATE POLICY "quote_running_numbers_internal_all" ON public.quote_running_numbers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

CREATE OR REPLACE FUNCTION public.assign_sales_quote_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  IF NEW.quote_no IS NULL OR btrim(NEW.quote_no) = '' THEN
    my := to_char(COALESCE(NEW.created_at, NOW()), 'YYYYMM');

    INSERT INTO public.quote_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.quote_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.quote_no := 'QT-' || right(my, 4) || '/' || lpad(n::text, 5, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_sales_quote_no ON public.sales_quotes;
CREATE TRIGGER trg_assign_sales_quote_no
BEFORE INSERT ON public.sales_quotes
FOR EACH ROW
EXECUTE FUNCTION public.assign_sales_quote_no();

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

    NEW.display_id := 'OR-' || right(my, 4) || '/' || lpad(n::text, 5, '0');
  END IF;

  NEW.remaining_amount := greatest(0, round(COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0), 2));
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;

