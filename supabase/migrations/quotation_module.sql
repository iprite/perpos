BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no TEXT NOT NULL,
  customer_id UUID,
  customer_name TEXT NOT NULL,
  customer_company TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  billing_address TEXT,
  currency TEXT NOT NULL DEFAULT 'THB',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected','cancelled')),
  created_by_profile_id UUID,
  approved_by_profile_id UUID,
  approved_at TIMESTAMPTZ,
  pdf_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_quotes_quote_no ON public.sales_quotes (quote_no);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_status ON public.sales_quotes (status);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_created_at ON public.sales_quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_customer_id ON public.sales_quotes (customer_id);

CREATE TABLE IF NOT EXISTS public.sales_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL,
  service_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_items_quote_id ON public.sales_quote_items (quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_quote_items_service_id ON public.sales_quote_items (service_id);

CREATE TABLE IF NOT EXISTS public.sales_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('call','email','meeting','task')),
  subject TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_followups_quote_id ON public.sales_followups (quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_followups_due_at ON public.sales_followups (due_at);
CREATE INDEX IF NOT EXISTS idx_sales_followups_reminder_at ON public.sales_followups (reminder_at);
CREATE INDEX IF NOT EXISTS idx_sales_followups_completed_at ON public.sales_followups (completed_at);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_quote_id UUID;
CREATE INDEX IF NOT EXISTS idx_orders_source_quote_id ON public.orders (source_quote_id);

CREATE TABLE IF NOT EXISTS public.order_item_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL,
  worker_id UUID NOT NULL,
  created_by_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_item_workers_unique ON public.order_item_workers (order_item_id, worker_id);
CREATE INDEX IF NOT EXISTS idx_order_item_workers_order_item_id ON public.order_item_workers (order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_workers_worker_id ON public.order_item_workers (worker_id);

ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_quotes_internal_all" ON public.sales_quotes;
CREATE POLICY "sales_quotes_internal_all" ON public.sales_quotes
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "sales_quote_items_internal_all" ON public.sales_quote_items;
CREATE POLICY "sales_quote_items_internal_all" ON public.sales_quote_items
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "sales_followups_internal_all" ON public.sales_followups;
CREATE POLICY "sales_followups_internal_all" ON public.sales_followups
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_item_workers_internal_all" ON public.order_item_workers;
CREATE POLICY "order_item_workers_internal_all" ON public.order_item_workers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_quote_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_followups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_workers TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;

