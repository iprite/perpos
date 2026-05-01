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
  jwtRole TEXT;
BEGIN
  jwtRole := auth.role();
  IF COALESCE(jwtRole, '') <> 'service_role' AND public.current_role() NOT IN ('admin','sale','operation') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN txn_type = 'TOP_UP' THEN amount ELSE -amount END), 0)
  INTO bal
  FROM public.petty_cash_transactions;

  RETURN bal;
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;
