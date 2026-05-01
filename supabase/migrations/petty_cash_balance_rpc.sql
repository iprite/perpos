BEGIN;

CREATE OR REPLACE FUNCTION public.petty_cash_balance()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bal NUMERIC;
BEGIN
  IF public.current_role() NOT IN ('admin','sale','operation') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN txn_type = 'TOP_UP' THEN amount ELSE -amount END), 0)
  INTO bal
  FROM public.petty_cash_transactions;

  RETURN bal;
END;
$$;

GRANT EXECUTE ON FUNCTION public.petty_cash_balance() TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;
