BEGIN;

ALTER TABLE public.document_expiry_notification_rules
  ADD COLUMN IF NOT EXISTS notify_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_to_profile_source_key
  ON public.notifications(to_profile_id, source_key)
  WHERE source_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_document_expiry_notifications(run_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(queued_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qc INT;
BEGIN
  WITH v AS (
    SELECT
      customer_id,
      worker_id,
      doc_type,
      expires_at,
      CASE WHEN expires_at IS NULL THEN NULL ELSE (expires_at - run_date)::INT END AS days_left
    FROM public.worker_document_expiry_view
  ),
  candidates AS (
    SELECT *
    FROM v
    WHERE customer_id IS NOT NULL
      AND expires_at IS NOT NULL
      AND days_left IS NOT NULL
  ),
  resolved AS (
    SELECT
      c.*, 
      COALESCE(r.lead_days, ARRAY[90,60,30,14,7,0]) AS lead_days,
      COALESCE(r.enabled, TRUE) AS enabled,
      COALESCE(r.notify_employer, TRUE) AS notify_employer,
      COALESCE(r.notify_sale, TRUE) AS notify_sale,
      COALESCE(r.notify_in_app, TRUE) AS notify_in_app,
      COALESCE(r.notify_email, TRUE) AS notify_email
    FROM candidates c
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.document_expiry_notification_rules r
      WHERE r.doc_type = c.doc_type
        AND (r.customer_id = c.customer_id OR r.customer_id IS NULL)
      ORDER BY (r.customer_id IS NOT NULL) DESC
      LIMIT 1
    ) r ON TRUE
  ),
  matched AS (
    SELECT *
    FROM resolved
    WHERE enabled
      AND (
        days_left = ANY(lead_days)
        OR (days_left < 0 AND (-1 = ANY(lead_days)))
      )
  ),
  employer_email_recipients AS (
    SELECT
      m.customer_id,
      m.worker_id,
      m.doc_type,
      m.expires_at,
      m.days_left,
      CASE WHEN m.days_left < 0 THEN -1 ELSE m.days_left END AS lead_day,
      'employer'::TEXT AS audience,
      'email'::TEXT AS channel,
      p.id AS recipient_profile_id,
      p.email AS destination_email
    FROM matched m
    JOIN public.customers c ON c.id = m.customer_id
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    JOIN public.profiles p ON p.id = om.profile_id
    WHERE m.notify_employer
      AND m.notify_email
      AND p.role = 'employer'
      AND p.email IS NOT NULL
  ),
  sale_email_recipients AS (
    SELECT
      m.customer_id,
      m.worker_id,
      m.doc_type,
      m.expires_at,
      m.days_left,
      CASE WHEN m.days_left < 0 THEN -1 ELSE m.days_left END AS lead_day,
      'sale'::TEXT AS audience,
      'email'::TEXT AS channel,
      p.id AS recipient_profile_id,
      p.email AS destination_email
    FROM matched m
    JOIN public.customers c ON c.id = m.customer_id
    JOIN public.profiles p ON p.id = c.created_by_profile_id
    WHERE m.notify_sale
      AND m.notify_email
      AND p.role = 'sale'
      AND p.email IS NOT NULL
  ),
  extra_email_recipients AS (
    SELECT
      m.customer_id,
      m.worker_id,
      m.doc_type,
      m.expires_at,
      m.days_left,
      CASE WHEN m.days_left < 0 THEN -1 ELSE m.days_left END AS lead_day,
      r.audience,
      r.channel,
      NULL::UUID AS recipient_profile_id,
      r.destination_email
    FROM matched m
    JOIN public.document_expiry_notification_recipients r
      ON r.customer_id = m.customer_id
    WHERE r.enabled
      AND m.notify_email
      AND r.channel = 'email'
      AND r.destination_email IS NOT NULL
      AND (
        (r.audience = 'employer' AND m.notify_employer)
        OR (r.audience = 'sale' AND m.notify_sale)
      )
  ),
  all_email_recipients AS (
    SELECT * FROM employer_email_recipients
    UNION ALL
    SELECT * FROM sale_email_recipients
    UNION ALL
    SELECT * FROM extra_email_recipients
  ),
  ins_email AS (
    INSERT INTO public.document_expiry_notification_deliveries (
      scan_date,
      customer_id,
      worker_id,
      doc_type,
      expires_at,
      days_left,
      lead_day,
      audience,
      channel,
      recipient_profile_id,
      destination_email
    )
    SELECT
      run_date AS scan_date,
      ar.customer_id,
      ar.worker_id,
      ar.doc_type,
      ar.expires_at,
      ar.days_left,
      ar.lead_day,
      ar.audience,
      ar.channel,
      ar.recipient_profile_id,
      ar.destination_email
    FROM all_email_recipients ar
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  in_app_recipients AS (
    SELECT
      m.customer_id,
      m.worker_id,
      m.doc_type,
      m.expires_at,
      m.days_left,
      CASE WHEN m.days_left < 0 THEN -1 ELSE m.days_left END AS lead_day,
      'employer'::TEXT AS audience,
      p.id AS recipient_profile_id
    FROM matched m
    JOIN public.customers c ON c.id = m.customer_id
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    JOIN public.profiles p ON p.id = om.profile_id
    WHERE m.notify_employer
      AND m.notify_in_app
      AND p.role = 'employer'
    UNION ALL
    SELECT
      m.customer_id,
      m.worker_id,
      m.doc_type,
      m.expires_at,
      m.days_left,
      CASE WHEN m.days_left < 0 THEN -1 ELSE m.days_left END AS lead_day,
      'sale'::TEXT AS audience,
      p.id AS recipient_profile_id
    FROM matched m
    JOIN public.customers c ON c.id = m.customer_id
    JOIN public.profiles p ON p.id = c.created_by_profile_id
    WHERE m.notify_sale
      AND m.notify_in_app
      AND p.role = 'sale'
  ),
  ins_app AS (
    INSERT INTO public.notifications (
      to_profile_id,
      severity,
      message,
      source_type,
      source_key
    )
    SELECT
      ar.recipient_profile_id,
      CASE
        WHEN ar.days_left < 0 THEN 'danger'
        WHEN ar.days_left <= 7 THEN 'warning'
        ELSE 'info'
      END AS severity,
      (
        CASE
          WHEN ar.doc_type = 'passport' THEN 'พาสปอร์ต'
          WHEN ar.doc_type = 'visa' THEN 'วีซ่า'
          ELSE 'ใบอนุญาตทำงาน'
        END
      )
      || ' ของ ' || w.full_name
      || ' (' || c.name || ')'
      || ' หมดอายุ ' || to_char(ar.expires_at, 'YYYY-MM-DD')
      || ' • เหลือ ' || ar.days_left::TEXT || ' วัน' AS message,
      'document_expiry'::TEXT AS source_type,
      'doc_expiry:'
      || run_date::TEXT
      || ':' || ar.customer_id::TEXT
      || ':' || ar.worker_id::TEXT
      || ':' || ar.doc_type
      || ':' || ar.lead_day::TEXT
      || ':' || ar.audience AS source_key
    FROM in_app_recipients ar
    JOIN public.workers w ON w.id = ar.worker_id
    JOIN public.customers c ON c.id = ar.customer_id
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT (COALESCE((SELECT COUNT(*) FROM ins_email), 0) + COALESCE((SELECT COUNT(*) FROM ins_app), 0)) INTO qc;

  RETURN QUERY SELECT COALESCE(qc, 0);
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;

