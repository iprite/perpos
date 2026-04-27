BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_orders_series(mode TEXT, start_date DATE)
RETURNS TABLE(bucket_key TEXT, total NUMERIC)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      CASE
        WHEN mode = 'weekly' THEN to_char(date_trunc('week', o.created_at)::date, 'YYYY-MM-DD')
        ELSE to_char(date_trunc('month', o.created_at)::date, 'YYYYMM')
      END AS bucket_key,
      COALESCE(o.total, 0)::numeric AS total
    FROM public.orders o
    WHERE o.created_at >= start_date
      AND o.status IN ('pending_approval', 'approved', 'in_progress', 'completed', 'cancelled')
  )
  SELECT
    b.bucket_key,
    SUM(b.total)::numeric AS total
  FROM base b
  GROUP BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_orders_series(TEXT, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
