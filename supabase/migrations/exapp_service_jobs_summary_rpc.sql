BEGIN;

CREATE OR REPLACE FUNCTION public.service_jobs_summary()
RETURNS TABLE(group_key TEXT, status_key TEXT, job_count BIGINT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN COALESCE(s.service_group_code, '') = 'mou' THEN 'mou'
      ELSE 'general'
    END AS group_key,
    COALESCE(oi.ops_status, 'not_started') AS status_key,
    COUNT(*)::BIGINT AS job_count
  FROM public.order_items oi
  LEFT JOIN public.services s ON s.id = oi.service_id
  GROUP BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.service_jobs_summary() TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;

