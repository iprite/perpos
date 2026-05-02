BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_line_connections (
  customer_id UUID PRIMARY KEY,
  line_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_CONNECTED' CHECK (status IN ('NOT_CONNECTED','PENDING','CONNECTED','ERROR')),
  connected_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_line_connections_status
  ON public.customer_line_connections(status);

CREATE TABLE IF NOT EXISTS public.customer_line_connect_tokens (
  token TEXT PRIMARY KEY,
  customer_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_line_connect_tokens_customer_id
  ON public.customer_line_connect_tokens(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_line_connect_tokens_expires_at
  ON public.customer_line_connect_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.employer_line_templates (
  event_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  template_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employer_line_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  event_key TEXT NOT NULL,
  ref_table TEXT NOT NULL,
  ref_id UUID NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('SENT','FAILED')),
  error_message TEXT,
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employer_line_message_logs_customer_id
  ON public.employer_line_message_logs(customer_id, created_at DESC);

ALTER TABLE public.customer_line_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_line_connect_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_line_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_line_message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_line_connections_admin_sale_all" ON public.customer_line_connections;
CREATE POLICY "customer_line_connections_admin_sale_all" ON public.customer_line_connections
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale'))
WITH CHECK (public.current_role() IN ('admin','sale'));

DROP POLICY IF EXISTS "customer_line_connect_tokens_admin_sale_all" ON public.customer_line_connect_tokens;
CREATE POLICY "customer_line_connect_tokens_admin_sale_all" ON public.customer_line_connect_tokens
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale'))
WITH CHECK (public.current_role() IN ('admin','sale'));

DROP POLICY IF EXISTS "employer_line_templates_admin_sale_all" ON public.employer_line_templates;
CREATE POLICY "employer_line_templates_admin_sale_all" ON public.employer_line_templates
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale'))
WITH CHECK (public.current_role() IN ('admin','sale'));

DROP POLICY IF EXISTS "employer_line_message_logs_admin_sale_all" ON public.employer_line_message_logs;
CREATE POLICY "employer_line_message_logs_admin_sale_all" ON public.employer_line_message_logs
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale'))
WITH CHECK (public.current_role() IN ('admin','sale'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_line_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_line_connect_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_line_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_line_message_logs TO authenticated;

INSERT INTO public.employer_line_templates (event_key, enabled, template_text)
VALUES
  ('quote_updated', TRUE, 'อัปเดตใบเสนอราคา {quoteNo}\nสถานะ: {status}\nดูเอกสาร: {link}'),
  ('order_updated', TRUE, 'อัปเดตออเดอร์ {orderNo}\nสถานะ: {status}\nดูรายละเอียด: {link}')
ON CONFLICT (event_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
