BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, profile_id)
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_internal_all" ON public.organizations;
CREATE POLICY "orgs_internal_all" ON public.organizations
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "orgs_member_select" ON public.organizations;
CREATE POLICY "orgs_member_select" ON public.organizations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "org_members_internal_all" ON public.organization_members;
CREATE POLICY "org_members_internal_all" ON public.organization_members
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "org_members_self_select" ON public.organization_members;
CREATE POLICY "org_members_self_select" ON public.organization_members
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(organization_id);

CREATE TABLE IF NOT EXISTS public.customer_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_representatives_profile_id ON public.customer_representatives(profile_id);
ALTER TABLE public.customer_representatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_reps_internal_all" ON public.customer_representatives;
CREATE POLICY "customer_reps_internal_all" ON public.customer_representatives
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "customer_reps_self_select" ON public.customer_representatives;
CREATE POLICY "customer_reps_self_select" ON public.customer_representatives
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "customers_employer_org_select" ON public.customers;
CREATE POLICY "customers_employer_org_select" ON public.customers
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = organization_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "customers_representative_assigned_select" ON public.customers;
CREATE POLICY "customers_representative_assigned_select" ON public.customers
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND (
    created_by_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.customer_representatives cr
      WHERE cr.customer_id = id
        AND cr.profile_id = auth.uid()
        AND cr.status = 'active'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "services_read" ON public.services;
CREATE POLICY "services_read" ON public.services
FOR SELECT
TO authenticated
USING (status = 'active' OR public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "services_internal_write" ON public.services;
CREATE POLICY "services_internal_write" ON public.services
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected','in_progress','completed')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approval_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_internal_all" ON public.orders;
CREATE POLICY "orders_internal_all" ON public.orders
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "orders_employer_org_select" ON public.orders;
CREATE POLICY "orders_employer_org_select" ON public.orders
FOR SELECT
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
);

DROP POLICY IF EXISTS "orders_representative_assigned_select" ON public.orders;
CREATE POLICY "orders_representative_assigned_select" ON public.orders
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.customer_representatives cr
    WHERE cr.customer_id = customer_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  description TEXT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_internal_all" ON public.order_items;
CREATE POLICY "order_items_internal_all" ON public.order_items
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_items_employer_select" ON public.order_items;
CREATE POLICY "order_items_employer_select" ON public.order_items
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE o.id = order_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "order_items_representative_select" ON public.order_items;
CREATE POLICY "order_items_representative_select" ON public.order_items
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.customer_representatives cr ON cr.customer_id = o.customer_id
    WHERE o.id = order_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_workers_order_id ON public.workers(order_id);

DROP POLICY IF EXISTS "workers_employer_org_select" ON public.workers;
CREATE POLICY "workers_employer_org_select" ON public.workers
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND customer_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = customer_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workers_representative_assigned_select" ON public.workers;
CREATE POLICY "workers_representative_assigned_select" ON public.workers
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND (
    created_by_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.customer_representatives cr
      WHERE cr.customer_id = customer_id
        AND cr.profile_id = auth.uid()
        AND cr.status = 'active'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  doc_type TEXT,
  expiry_date DATE,
  drive_file_id TEXT,
  drive_web_view_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON public.customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_expiry_date ON public.customer_documents(expiry_date);
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_documents_internal_all" ON public.customer_documents;
CREATE POLICY "customer_documents_internal_all" ON public.customer_documents
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "customer_documents_employer_select" ON public.customer_documents;
CREATE POLICY "customer_documents_employer_select" ON public.customer_documents
FOR SELECT
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
);

DROP POLICY IF EXISTS "customer_documents_representative_select" ON public.customer_documents;
CREATE POLICY "customer_documents_representative_select" ON public.customer_documents
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.customer_representatives cr
    WHERE cr.customer_id = customer_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

CREATE TABLE IF NOT EXISTS public.order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  doc_type TEXT,
  drive_file_id TEXT,
  drive_web_view_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON public.order_documents(order_id);
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_documents_internal_all" ON public.order_documents;
CREATE POLICY "order_documents_internal_all" ON public.order_documents
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_documents_employer_select" ON public.order_documents;
CREATE POLICY "order_documents_employer_select" ON public.order_documents
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE o.id = order_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "order_documents_representative_select" ON public.order_documents;
CREATE POLICY "order_documents_representative_select" ON public.order_documents
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.customer_representatives cr ON cr.customer_id = o.customer_id
    WHERE o.id = order_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  worker_document_id UUID REFERENCES public.worker_documents(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','danger')),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_to_profile_id ON public.notifications(to_profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_internal_all" ON public.notifications;
CREATE POLICY "notifications_internal_all" ON public.notifications
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "notifications_self" ON public.notifications;
CREATE POLICY "notifications_self" ON public.notifications
FOR SELECT
TO authenticated
USING (to_profile_id = auth.uid());

DROP POLICY IF EXISTS "notifications_self_update" ON public.notifications;
CREATE POLICY "notifications_self_update" ON public.notifications
FOR UPDATE
TO authenticated
USING (to_profile_id = auth.uid())
WITH CHECK (to_profile_id = auth.uid());

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poa_request_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poa_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poa_request_workers TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_representatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

