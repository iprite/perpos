BEGIN;

CREATE TABLE IF NOT EXISTS public.document_expiry_notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','wp')),
  lead_days INT[] NOT NULL DEFAULT ARRAY[90,60,30,14,7,0],
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notify_employer BOOLEAN NOT NULL DEFAULT TRUE,
  notify_sale BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_den_rules_unique ON public.document_expiry_notification_rules(customer_id, doc_type);

CREATE TABLE IF NOT EXISTS public.document_expiry_notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','wp')),
  audience TEXT NOT NULL CHECK (audience IN ('employer','sale')),
  channel TEXT NOT NULL CHECK (channel IN ('email')),
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_den_templates_unique ON public.document_expiry_notification_templates(customer_id, doc_type, audience, channel);

CREATE TABLE IF NOT EXISTS public.document_expiry_notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('employer','sale')),
  channel TEXT NOT NULL CHECK (channel IN ('email')),
  destination_email TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_den_recipients_customer ON public.document_expiry_notification_recipients(customer_id);
CREATE INDEX IF NOT EXISTS idx_den_recipients_enabled ON public.document_expiry_notification_recipients(enabled);

CREATE TABLE IF NOT EXISTS public.document_expiry_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date DATE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','wp')),
  expires_at DATE NOT NULL,
  days_left INT NOT NULL,
  lead_day INT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('employer','sale')),
  channel TEXT NOT NULL CHECK (channel IN ('email')),
  recipient_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  destination_email TEXT NOT NULL,
  template_id UUID REFERENCES public.document_expiry_notification_templates(id) ON DELETE SET NULL,
  subject_snapshot TEXT,
  body_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_den_deliveries_dedupe
  ON public.document_expiry_notification_deliveries(customer_id, worker_id, doc_type, expires_at, lead_day, audience, channel, destination_email);

CREATE INDEX IF NOT EXISTS idx_den_deliveries_status ON public.document_expiry_notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_den_deliveries_customer ON public.document_expiry_notification_deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_den_deliveries_scan_date ON public.document_expiry_notification_deliveries(scan_date);

CREATE OR REPLACE VIEW public.worker_document_expiry_view AS
  SELECT
    w.id AS worker_id,
    w.customer_id,
    w.full_name AS worker_full_name,
    w.passport_no,
    w.wp_number,
    'passport'::TEXT AS doc_type,
    w.passport_expire_date AS expires_at,
    CASE WHEN w.passport_expire_date IS NULL THEN NULL ELSE (w.passport_expire_date - CURRENT_DATE)::INT END AS days_left
  FROM public.workers w
  UNION ALL
  SELECT
    w.id AS worker_id,
    w.customer_id,
    w.full_name AS worker_full_name,
    w.passport_no,
    w.wp_number,
    'visa'::TEXT AS doc_type,
    w.visa_exp_date AS expires_at,
    CASE WHEN w.visa_exp_date IS NULL THEN NULL ELSE (w.visa_exp_date - CURRENT_DATE)::INT END AS days_left
  FROM public.workers w
  UNION ALL
  SELECT
    w.id AS worker_id,
    w.customer_id,
    w.full_name AS worker_full_name,
    w.passport_no,
    w.wp_number,
    'wp'::TEXT AS doc_type,
    w.wp_expire_date AS expires_at,
    CASE WHEN w.wp_expire_date IS NULL THEN NULL ELSE (w.wp_expire_date - CURRENT_DATE)::INT END AS days_left
  FROM public.workers w;

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
      COALESCE(r.notify_sale, TRUE) AS notify_sale
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
  employer_recipients AS (
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
      AND p.role = 'employer'
      AND p.email IS NOT NULL
  ),
  sale_recipients AS (
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
      AND p.role = 'sale'
      AND p.email IS NOT NULL
  ),
  extra_recipients AS (
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
      AND r.channel = 'email'
      AND r.destination_email IS NOT NULL
  ),
  all_recipients AS (
    SELECT * FROM employer_recipients
    UNION ALL
    SELECT * FROM sale_recipients
    UNION ALL
    SELECT * FROM extra_recipients
  ),
  ins AS (
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
    FROM all_recipients ar
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO qc FROM ins;

  RETURN QUERY SELECT COALESCE(qc, 0);
END;
$$;

ALTER TABLE public.document_expiry_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_expiry_notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_expiry_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_expiry_notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "den_rules_internal_all" ON public.document_expiry_notification_rules;
CREATE POLICY "den_rules_internal_all" ON public.document_expiry_notification_rules
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "den_templates_internal_all" ON public.document_expiry_notification_templates;
CREATE POLICY "den_templates_internal_all" ON public.document_expiry_notification_templates
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "den_recipients_internal_all" ON public.document_expiry_notification_recipients;
CREATE POLICY "den_recipients_internal_all" ON public.document_expiry_notification_recipients
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "den_recipients_employer_org" ON public.document_expiry_notification_recipients;
CREATE POLICY "den_recipients_employer_org" ON public.document_expiry_notification_recipients
FOR ALL
TO authenticated
USING (
  public.current_role() = 'employer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = customer_id
      AND om.profile_id = auth.uid()
  )
)
WITH CHECK (
  public.current_role() = 'employer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = customer_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "den_deliveries_internal_select" ON public.document_expiry_notification_deliveries;
CREATE POLICY "den_deliveries_internal_select" ON public.document_expiry_notification_deliveries
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "den_deliveries_self_select" ON public.document_expiry_notification_deliveries;
CREATE POLICY "den_deliveries_self_select" ON public.document_expiry_notification_deliveries
FOR SELECT
TO authenticated
USING (
  recipient_profile_id = auth.uid()
  OR (
    public.current_role() = 'sale'
    AND EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = customer_id
        AND c.created_by_profile_id = auth.uid()
    )
  )
  OR (
    public.current_role() = 'employer'
    AND audience = 'employer'
    AND EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.organization_members om ON om.organization_id = c.organization_id
      WHERE c.id = customer_id
        AND om.profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "den_deliveries_internal_write" ON public.document_expiry_notification_deliveries;
CREATE POLICY "den_deliveries_internal_write" ON public.document_expiry_notification_deliveries
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

GRANT SELECT ON public.worker_document_expiry_view TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_expiry_notification_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_expiry_notification_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_expiry_notification_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_expiry_notification_deliveries TO authenticated;

INSERT INTO public.document_expiry_notification_rules (customer_id, doc_type, lead_days, enabled, notify_employer, notify_sale)
VALUES
  (NULL, 'passport', ARRAY[90,60,30,14,7,0], TRUE, TRUE, TRUE),
  (NULL, 'visa', ARRAY[90,60,30,14,7,0], TRUE, TRUE, TRUE),
  (NULL, 'wp', ARRAY[90,60,30,14,7,0], TRUE, TRUE, TRUE)
ON CONFLICT (customer_id, doc_type) DO NOTHING;

INSERT INTO public.document_expiry_notification_templates (customer_id, doc_type, audience, channel, subject_template, body_template, enabled)
VALUES
  (
    NULL,
    'passport',
    'employer',
    'email',
    'แจ้งเตือนพาสปอร์ตใกล้หมดอายุ: {{worker_full_name}} (เหลือ {{days_left}} วัน)',
    'บริษัท: {{customer_name}}\nแรงงาน: {{worker_full_name}}\nประเภทเอกสาร: พาสปอร์ต\nวันหมดอายุ: {{expires_at}}\nเหลืออีก: {{days_left}} วัน\nเลขพาสปอร์ต: {{passport_no}}\n\nกรุณาดำเนินการต่ออายุ/ตรวจสอบข้อมูลในระบบ',
    TRUE
  ),
  (
    NULL,
    'passport',
    'sale',
    'email',
    'แจ้งเตือนให้ติดตามลูกค้า: พาสปอร์ตใกล้หมดอายุ ({{customer_name}})',
    'ลูกค้า: {{customer_name}}\nแรงงาน: {{worker_full_name}}\nประเภทเอกสาร: พาสปอร์ต\nวันหมดอายุ: {{expires_at}}\nเหลืออีก: {{days_left}} วัน\n\nโปรดแจ้งลูกค้าและติดตามการต่ออายุ',
    TRUE
  ),
  (
    NULL,
    'visa',
    'employer',
    'email',
    'แจ้งเตือนวีซ่าใกล้หมดอายุ: {{worker_full_name}} (เหลือ {{days_left}} วัน)',
    'บริษัท: {{customer_name}}\nแรงงาน: {{worker_full_name}}\nประเภทเอกสาร: วีซ่า\nวันหมดอายุ: {{expires_at}}\nเหลืออีก: {{days_left}} วัน\nเลขพาสปอร์ต: {{passport_no}}\n\nกรุณาดำเนินการต่ออายุ/ตรวจสอบข้อมูลในระบบ',
    TRUE
  ),
  (
    NULL,
    'visa',
    'sale',
    'email',
    'แจ้งเตือนให้ติดตามลูกค้า: วีซ่าใกล้หมดอายุ ({{customer_name}})',
    'ลูกค้า: {{customer_name}}\nแรงงาน: {{worker_full_name}}\nประเภทเอกสาร: วีซ่า\nวันหมดอายุ: {{expires_at}}\nเหลืออีก: {{days_left}} วัน\n\nโปรดแจ้งลูกค้าและติดตามการต่ออายุ',
    TRUE
  ),
  (
    NULL,
    'wp',
    'employer',
    'email',
    'แจ้งเตือนใบอนุญาตทำงานใกล้หมดอายุ: {{worker_full_name}} (เหลือ {{days_left}} วัน)',
    'บริษัท: {{customer_name}}\nแรงงาน: {{worker_full_name}}\nประเภทเอกสาร: ใบอนุญาตทำงาน\nวันหมดอายุ: {{expires_at}}\nเหลืออีก: {{days_left}} วัน\nเลขใบอนุญาตทำงาน: {{wp_number}}\n\nกรุณาดำเนินการต่ออายุ/ตรวจสอบข้อมูลในระบบ',
    TRUE
  ),
  (
    NULL,
    'wp',
    'sale',
    'email',
    'แจ้งเตือนให้ติดตามลูกค้า: ใบอนุญาตทำงานใกล้หมดอายุ ({{customer_name}})',
    'ลูกค้า: {{customer_name}}\nแรงงาน: {{worker_full_name}}\nประเภทเอกสาร: ใบอนุญาตทำงาน\nวันหมดอายุ: {{expires_at}}\nเหลืออีก: {{days_left}} วัน\n\nโปรดแจ้งลูกค้าและติดตามการต่ออายุ',
    TRUE
  )
ON CONFLICT (customer_id, doc_type, audience, channel) DO NOTHING;

NOTIFY pgrst, 'reload config';

COMMIT;

