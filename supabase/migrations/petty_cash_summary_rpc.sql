BEGIN;

CREATE OR REPLACE FUNCTION public.petty_cash_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bal NUMERIC;
  today_in NUMERIC;
  today_out NUMERIC;
  month_in NUMERIC;
  month_out NUMERIC;
  jwtRole TEXT;
  today DATE;
  month_start DATE;
BEGIN
  jwtRole := auth.role();
  IF COALESCE(jwtRole, '') <> 'service_role' AND public.current_role() NOT IN ('admin','sale','operation') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  today := CURRENT_DATE;
  month_start := date_trunc('month', today)::date;

  SELECT COALESCE(SUM(CASE WHEN txn_type = 'TOP_UP' THEN amount ELSE -amount END), 0)
  INTO bal
  FROM public.petty_cash_transactions;

  SELECT
    COALESCE(SUM(CASE WHEN txn_type = 'TOP_UP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN txn_type = 'SPEND' THEN amount ELSE 0 END), 0)
  INTO today_in, today_out
  FROM public.petty_cash_transactions
  WHERE occurred_at = today;

  SELECT
    COALESCE(SUM(CASE WHEN txn_type = 'TOP_UP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN txn_type = 'SPEND' THEN amount ELSE 0 END), 0)
  INTO month_in, month_out
  FROM public.petty_cash_transactions
  WHERE occurred_at >= month_start
    AND occurred_at <= today;

  RETURN jsonb_build_object(
    'balance', bal,
    'today_top_up', today_in,
    'today_spend', today_out,
    'month_top_up', month_in,
    'month_spend', month_out
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.petty_cash_summary() TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;
