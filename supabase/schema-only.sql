BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','sale','operation','employer','representative')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'sale')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_role() = 'admin';
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_bootstrap_first_admin" ON public.profiles;

CREATE POLICY "profiles_bootstrap_first_admin" ON public.profiles
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.role = 'admin')
)
WITH CHECK (
  id = auth.uid()
  AND role = 'admin'
);

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_created_by_profile_id ON public.customers(created_by_profile_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_internal_all" ON public.customers;

CREATE POLICY "customers_internal_all" ON public.customers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "customers_representative_own" ON public.customers;

CREATE POLICY "customers_representative_own" ON public.customers
FOR ALL
TO authenticated
USING (created_by_profile_id = auth.uid())
WITH CHECK (created_by_profile_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  passport_no TEXT,
  nationality TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workers_customer_id ON public.workers(customer_id);

CREATE INDEX IF NOT EXISTS idx_workers_created_by_profile_id ON public.workers(created_by_profile_id);

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers_internal_all" ON public.workers;

CREATE POLICY "workers_internal_all" ON public.workers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "workers_representative_own" ON public.workers;

CREATE POLICY "workers_representative_own" ON public.workers
FOR ALL
TO authenticated
USING (created_by_profile_id = auth.uid())
WITH CHECK (created_by_profile_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.worker_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  doc_type TEXT,
  expiry_date DATE,
  drive_file_id TEXT,
  drive_web_view_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_documents_worker_id ON public.worker_documents(worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_documents_expiry_date ON public.worker_documents(expiry_date);

ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_documents_internal_all" ON public.worker_documents;

CREATE POLICY "worker_documents_internal_all" ON public.worker_documents
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "worker_documents_representative_own" ON public.worker_documents;

CREATE POLICY "worker_documents_representative_own" ON public.worker_documents
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.id = worker_id
      AND w.created_by_profile_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.id = worker_id
      AND w.created_by_profile_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.poa_request_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  per_worker_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poa_request_types_is_active ON public.poa_request_types(is_active);

ALTER TABLE public.poa_request_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_request_types_read" ON public.poa_request_types;

CREATE POLICY "poa_request_types_read" ON public.poa_request_types
FOR SELECT
TO authenticated
USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "poa_request_types_admin_write" ON public.poa_request_types;

CREATE POLICY "poa_request_types_admin_write" ON public.poa_request_types
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.poa_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  representative_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  poa_request_type_id UUID NOT NULL REFERENCES public.poa_request_types(id) ON DELETE RESTRICT,
  worker_count INT NOT NULL DEFAULT 1,
  reason TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','need_info','issued','rejected')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poa_requests_rep ON public.poa_requests(representative_profile_id);

CREATE INDEX IF NOT EXISTS idx_poa_requests_status ON public.poa_requests(status);

CREATE INDEX IF NOT EXISTS idx_poa_requests_customer_id ON public.poa_requests(customer_id);

CREATE INDEX IF NOT EXISTS idx_poa_requests_type_id ON public.poa_requests(poa_request_type_id);

ALTER TABLE public.poa_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_requests_internal_all" ON public.poa_requests;

CREATE POLICY "poa_requests_internal_all" ON public.poa_requests
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_requests_representative_own" ON public.poa_requests;

CREATE POLICY "poa_requests_representative_own" ON public.poa_requests
FOR ALL
TO authenticated
USING (representative_profile_id = auth.uid())
WITH CHECK (representative_profile_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.poa_request_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_request_id UUID NOT NULL REFERENCES public.poa_requests(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poa_request_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_poa_request_workers_req ON public.poa_request_workers(poa_request_id);

ALTER TABLE public.poa_request_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_request_workers_internal_all" ON public.poa_request_workers;

CREATE POLICY "poa_request_workers_internal_all" ON public.poa_request_workers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_request_workers_representative_own" ON public.poa_request_workers;

CREATE POLICY "poa_request_workers_representative_own" ON public.poa_request_workers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.representative_profile_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.representative_profile_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload config';

COMMIT;


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


BEGIN;

CREATE TABLE IF NOT EXISTS public.order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  installment_no SMALLINT NOT NULL DEFAULT 1,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  slip_url TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_order_installment
  ON public.order_payments(order_id, installment_no);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_payments_admin_read" ON public.order_payments;

CREATE POLICY "order_payments_admin_read" ON public.order_payments
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_payments_admin_write" ON public.order_payments;

CREATE POLICY "order_payments_admin_write" ON public.order_payments
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE TABLE IF NOT EXISTS public.order_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  slip_url TEXT NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_refunds_order_unique ON public.order_refunds(order_id);

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_refunds_admin_read" ON public.order_refunds;

CREATE POLICY "order_refunds_admin_read" ON public.order_refunds
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_refunds_admin_write" ON public.order_refunds;

CREATE POLICY "order_refunds_admin_write" ON public.order_refunds
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS ops_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ops_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ops_updated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_ops_status_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_ops_status_check
  CHECK (ops_status IN ('not_started','in_progress','done'));

CREATE INDEX IF NOT EXISTS idx_order_items_order_ops_status ON public.order_items(order_id, ops_status);

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.recompute_order_payment_amounts(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  paid NUMERIC(12,2);
BEGIN
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO paid
  FROM public.order_payments
  WHERE order_id = target_order_id
    AND confirmed_at IS NOT NULL;

  UPDATE public.orders
  SET paid_amount = paid
  WHERE id = target_order_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_table TEXT,
  entity_id UUID,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_events_internal_read" ON public.order_events;

CREATE POLICY "order_events_internal_read" ON public.order_events
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_events_internal_write" ON public.order_events;

CREATE POLICY "order_events_internal_write" ON public.order_events
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_events TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

-- Add Supabase Storage metadata columns for documents

ALTER TABLE IF EXISTS public.customer_documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

ALTER TABLE IF EXISTS public.order_documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

ALTER TABLE IF EXISTS public.worker_documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

-- legacy Drive links should be nullable to allow storage-only records
ALTER TABLE IF EXISTS public.customer_documents
  ALTER COLUMN drive_web_view_link DROP NOT NULL;

ALTER TABLE IF EXISTS public.order_documents
  ALTER COLUMN drive_web_view_link DROP NOT NULL;

ALTER TABLE IF EXISTS public.worker_documents
  ALTER COLUMN drive_web_view_link DROP NOT NULL;

-- Slips: add Supabase Storage metadata columns
ALTER TABLE IF EXISTS public.order_payments
  ADD COLUMN IF NOT EXISTS slip_storage_provider TEXT NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS slip_storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS slip_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS slip_file_name TEXT,
  ADD COLUMN IF NOT EXISTS slip_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS slip_size_bytes BIGINT;

ALTER TABLE IF EXISTS public.order_refunds
  ALTER COLUMN slip_url DROP NOT NULL;

ALTER TABLE IF EXISTS public.order_refunds
  ADD COLUMN IF NOT EXISTS slip_storage_provider TEXT NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS slip_storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS slip_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS slip_file_name TEXT,
  ADD COLUMN IF NOT EXISTS slip_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS slip_size_bytes BIGINT;

CREATE INDEX IF NOT EXISTS idx_order_documents_storage_path ON public.order_documents(storage_path);

CREATE INDEX IF NOT EXISTS idx_worker_documents_storage_path ON public.worker_documents(storage_path);

CREATE INDEX IF NOT EXISTS idx_customer_documents_storage_path ON public.customer_documents(storage_path);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE TABLE IF NOT EXISTS public.company_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_code TEXT NOT NULL,
  address TEXT,
  bt15_status TEXT,
  card_image TEXT,
  contract_status TEXT,
  extra_poa TEXT,
  files TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_representatives_rep_code_unique
  ON public.company_representatives(rep_code);

ALTER TABLE public.company_representatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_representatives_admin_write" ON public.company_representatives;

CREATE POLICY "company_representatives_admin_write" ON public.company_representatives
FOR ALL
TO authenticated
USING (public.current_role() = 'admin')
WITH CHECK (public.current_role() = 'admin');

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE TABLE IF NOT EXISTS public.pat (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  province_th TEXT NOT NULL,
  province_en TEXT,
  district_th TEXT NOT NULL,
  district_en TEXT,
  subdistrict_th TEXT NOT NULL,
  subdistrict_en TEXT,
  postcode TEXT NOT NULL,
  all_th TEXT,
  all_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW public."PAT" AS
SELECT * FROM public.pat;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pat_unique
  ON public.pat (province_th, district_th, subdistrict_th, postcode);

ALTER TABLE public.pat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pat_admin_read" ON public.pat;

CREATE POLICY "pat_admin_read" ON public.pat
FOR SELECT
TO authenticated
USING (public.current_role() = 'admin');

DROP POLICY IF EXISTS "pat_admin_write" ON public.pat;

CREATE POLICY "pat_admin_write" ON public.pat
FOR ALL
TO authenticated
USING (public.current_role() = 'admin')
WITH CHECK (public.current_role() = 'admin');

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE OR REPLACE VIEW public.pat_provinces AS
SELECT DISTINCT province_th
FROM public.pat
WHERE province_th IS NOT NULL AND province_th <> '';

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.company_representatives
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS id_card_no TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS photo TEXT;

ALTER TABLE public.company_representatives
  DROP COLUMN IF EXISTS bt15_status,
  DROP COLUMN IF EXISTS contract_status,
  DROP COLUMN IF EXISTS extra_poa,
  DROP COLUMN IF EXISTS card_image,
  DROP COLUMN IF EXISTS files;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.company_representatives
  ADD COLUMN IF NOT EXISTS prefix TEXT;

CREATE OR REPLACE FUNCTION public.set_company_representative_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.prefix := CASE
    WHEN NEW.gender = 'ชาย' THEN 'นาย'
    WHEN NEW.gender = 'หญิง' THEN 'นางสาว'
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_representative_prefix ON public.company_representatives;

CREATE TRIGGER trg_set_company_representative_prefix
BEFORE INSERT OR UPDATE OF gender
ON public.company_representatives
FOR EACH ROW
EXECUTE FUNCTION public.set_company_representative_prefix();

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS display_id TEXT;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tax_id TEXT;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT 'สำนักงานใหญ่';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_display_id_unique ON public.customers(display_id);

CREATE SEQUENCE IF NOT EXISTS public.customers_display_id_seq;

CREATE OR REPLACE FUNCTION public.assign_customer_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_no BIGINT;
BEGIN
  IF NEW.display_id IS NULL OR btrim(NEW.display_id) = '' THEN
    next_no := nextval('public.customers_display_id_seq');
    NEW.display_id := '#' || lpad(next_no::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_customer_display_id ON public.customers;

CREATE TRIGGER trg_assign_customer_display_id
BEFORE INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.assign_customer_display_id();

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS province_th TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_province_th ON public.customers(province_th);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE IF EXISTS public.customers
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

ALTER TABLE IF EXISTS public.orders
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

ALTER TABLE IF EXISTS public.workers
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check1;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft','pending_approval','approved','rejected','in_progress','completed','cancelled'));

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS display_id TEXT;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_id_unique ON public.orders(display_id);

CREATE TABLE IF NOT EXISTS public.order_running_numbers (
  month_year TEXT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.assign_order_display_id_and_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  NEW.paid_amount := round(COALESCE(NEW.paid_amount, 0), 2);

  IF NEW.display_id IS NULL OR btrim(NEW.display_id) = '' THEN
    my := to_char(COALESCE(NEW.created_at, NOW()), 'MMYYYY');

    INSERT INTO public.order_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.order_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.display_id := '#' || my || lpad(n::text, 4, '0');
  END IF;

  NEW.remaining_amount := greatest(0, round(COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0), 2));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_order_display_id_and_amounts ON public.orders;

CREATE TRIGGER trg_assign_order_display_id_and_amounts
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_display_id_and_amounts();

CREATE OR REPLACE FUNCTION public.recompute_order_payment_amounts(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  paid NUMERIC(12,2);
BEGIN
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO paid
  FROM public.order_payments
  WHERE order_id = target_order_id;

  UPDATE public.orders
  SET paid_amount = paid
  WHERE id = target_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_order_payments_recompute_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order_payment_amounts(OLD.order_id);
  ELSE
    PERFORM public.recompute_order_payment_amounts(NEW.order_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_recompute_orders ON public.order_payments;

CREATE TRIGGER trg_order_payments_recompute_orders
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_payments_recompute_orders();

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE OR REPLACE FUNCTION public.assign_order_display_id_and_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  NEW.paid_amount := round(COALESCE(NEW.paid_amount, 0), 2);

  IF NEW.display_id IS NULL OR btrim(NEW.display_id) = '' THEN
    my := to_char(COALESCE(NEW.created_at, NOW()), 'YYYYMM');

    INSERT INTO public.order_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.order_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.display_id := '#' || my || lpad(n::text, 4, '0');
  END IF;

  NEW.remaining_amount := greatest(0, round(COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0), 2));
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS include_vat BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wht_rate NUMERIC(5,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.poa_request_types
  DROP COLUMN IF EXISTS per_worker_price,
  DROP COLUMN IF EXISTS description;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_documents_employer_org_select" ON public.worker_documents;

CREATE POLICY "worker_documents_employer_org_select" ON public.worker_documents
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND EXISTS (
    SELECT 1
    FROM public.workers w
    JOIN public.customers c ON c.id = w.customer_id
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE w.id = worker_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "worker_documents_representative_assigned_select" ON public.worker_documents;

CREATE POLICY "worker_documents_representative_assigned_select" ON public.worker_documents
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.workers w
    JOIN public.customer_representatives cr ON cr.customer_id = w.customer_id
    WHERE w.id = worker_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_documents TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;


BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS service_group TEXT,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_detail TEXT,
  ADD COLUMN IF NOT EXISTS task_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.services
  ALTER COLUMN job_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_job_id_unique ON public.services(job_id);

CREATE INDEX IF NOT EXISTS idx_services_service_group ON public.services(service_group);

DROP POLICY IF EXISTS "services_internal_write" ON public.services;

DROP POLICY IF EXISTS "services_admin_write" ON public.services;

CREATE POLICY "services_admin_write" ON public.services
FOR ALL
TO authenticated
USING (public.current_role() = 'admin')
WITH CHECK (public.current_role() = 'admin');

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_group_code TEXT;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_service_group_code_check;

ALTER TABLE public.services
  ALTER COLUMN service_group_code SET DEFAULT 'general';

ALTER TABLE public.services
  ALTER COLUMN service_group_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_services_service_group_code ON public.services(service_group_code);

ALTER TABLE public.services
  ADD CONSTRAINT services_service_group_code_check
  CHECK (service_group_code IN ('mou','registration','general'));

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_price_detail TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS alien_identification_number TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS father_name_en TEXT,
  ADD COLUMN IF NOT EXISTS os_passport_type TEXT,
  ADD COLUMN IF NOT EXISTS os_sex TEXT,
  ADD COLUMN IF NOT EXISTS os_worker_type TEXT,
  ADD COLUMN IF NOT EXISTS os_wp_type TEXT,
  ADD COLUMN IF NOT EXISTS passport_expire_date DATE,
  ADD COLUMN IF NOT EXISTS passport_issue_at TEXT,
  ADD COLUMN IF NOT EXISTS passport_issue_country TEXT,
  ADD COLUMN IF NOT EXISTS passport_issue_date DATE,
  ADD COLUMN IF NOT EXISTS passport_type TEXT,
  ADD COLUMN IF NOT EXISTS profile_pic_url TEXT,
  ADD COLUMN IF NOT EXISTS visa_exp_date DATE,
  ADD COLUMN IF NOT EXISTS visa_iss_date DATE,
  ADD COLUMN IF NOT EXISTS visa_issued_at TEXT,
  ADD COLUMN IF NOT EXISTS visa_number TEXT,
  ADD COLUMN IF NOT EXISTS visa_type TEXT,
  ADD COLUMN IF NOT EXISTS wp_expire_date DATE,
  ADD COLUMN IF NOT EXISTS wp_issue_date DATE,
  ADD COLUMN IF NOT EXISTS wp_number TEXT,
  ADD COLUMN IF NOT EXISTS wp_type TEXT;

CREATE INDEX IF NOT EXISTS idx_workers_passport_no ON public.workers(passport_no);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

DROP POLICY IF EXISTS "pat_admin_read" ON public.pat;

DROP POLICY IF EXISTS "pat_internal_read" ON public.pat;

CREATE POLICY "pat_internal_read" ON public.pat
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin', 'sale', 'operation'));

CREATE OR REPLACE VIEW public.pat_provinces AS
SELECT DISTINCT province_th
FROM public.pat
WHERE province_th IS NOT NULL AND province_th <> '';

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE OR REPLACE FUNCTION public.assign_order_display_id_and_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  NEW.paid_amount := round(COALESCE(NEW.paid_amount, 0), 2);

  IF NEW.display_id IS NULL OR btrim(NEW.display_id) = '' THEN
    my := to_char(COALESCE(NEW.created_at, NOW()), 'YYYYMM');

    INSERT INTO public.order_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.order_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.display_id := '#' || my || lpad(n::text, 4, '0');
  END IF;

  NEW.remaining_amount := greatest(0, round(COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0), 2));
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.order_running_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_running_numbers_internal_all" ON public.order_running_numbers;

CREATE POLICY "order_running_numbers_internal_all" ON public.order_running_numbers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

CREATE OR REPLACE FUNCTION public.assign_order_display_id_and_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my TEXT;
  n INT;
BEGIN
  NEW.paid_amount := round(COALESCE(NEW.paid_amount, 0), 2);

  IF NEW.display_id IS NULL OR btrim(NEW.display_id) = '' THEN
    my := to_char(COALESCE(NEW.created_at, NOW()), 'YYYYMM');

    INSERT INTO public.order_running_numbers(month_year, last_no)
    VALUES (my, 1)
    ON CONFLICT (month_year)
    DO UPDATE SET last_no = public.order_running_numbers.last_no + 1, updated_at = NOW()
    RETURNING last_no INTO n;

    NEW.display_id := '#' || my || lpad(n::text, 4, '0');
  END IF;

  NEW.remaining_amount := greatest(0, round(COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0), 2));
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS import_temp_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_import_temp_id_unique ON public.customers(import_temp_id);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

DROP POLICY IF EXISTS "worker_profile_pics_public_read" ON storage.objects;

CREATE POLICY "worker_profile_pics_public_read" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'worker_profile_pics');

DROP POLICY IF EXISTS "worker_profile_pics_authenticated_insert" ON storage.objects;

CREATE POLICY "worker_profile_pics_authenticated_insert" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
);

DROP POLICY IF EXISTS "worker_profile_pics_authenticated_update" ON storage.objects;

CREATE POLICY "worker_profile_pics_authenticated_update" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
)
WITH CHECK (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
);

DROP POLICY IF EXISTS "worker_profile_pics_authenticated_delete" ON storage.objects;

CREATE POLICY "worker_profile_pics_authenticated_delete" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'worker_profile_pics'
  AND public.current_role() IN ('admin','sale','operation','representative')
);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS import_temp_id TEXT,
  ADD COLUMN IF NOT EXISTS employer_name TEXT,
  ADD COLUMN IF NOT EXISTS employer_address TEXT,
  ADD COLUMN IF NOT EXISTS employer_tax_id TEXT,
  ADD COLUMN IF NOT EXISTS employer_tel TEXT,
  ADD COLUMN IF NOT EXISTS employer_type TEXT,
  ADD COLUMN IF NOT EXISTS worker_male INT,
  ADD COLUMN IF NOT EXISTS worker_female INT,
  ADD COLUMN IF NOT EXISTS worker_nation TEXT,
  ADD COLUMN IF NOT EXISTS worker_type TEXT;

ALTER TABLE public.poa_requests
  ALTER COLUMN poa_request_type_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'poa_requests_status_check'
      AND conrelid = 'public.poa_requests'::regclass
  ) THEN
    ALTER TABLE public.poa_requests DROP CONSTRAINT poa_requests_status_check;
  END IF;
END $$;

ALTER TABLE public.poa_requests
  ADD CONSTRAINT poa_requests_status_check
  CHECK (status IN ('draft','submitted','paid','completed','need_info','issued','rejected','cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_poa_requests_import_temp_id ON public.poa_requests(import_temp_id);

CREATE TABLE IF NOT EXISTS public.poa_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_request_id UUID NOT NULL REFERENCES public.poa_requests(id) ON DELETE CASCADE,
  poa_request_type_id UUID NOT NULL REFERENCES public.poa_request_types(id) ON DELETE RESTRICT,
  unit_price_per_worker NUMERIC(12,2) NOT NULL DEFAULT 0,
  worker_count INT NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poa_request_id, poa_request_type_id)
);

CREATE INDEX IF NOT EXISTS idx_poa_request_items_request_id ON public.poa_request_items(poa_request_id);

CREATE INDEX IF NOT EXISTS idx_poa_request_items_payment_status ON public.poa_request_items(payment_status);

ALTER TABLE public.poa_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_request_items_internal_all" ON public.poa_request_items;

CREATE POLICY "poa_request_items_internal_all" ON public.poa_request_items
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_request_items_representative_own" ON public.poa_request_items;

CREATE POLICY "poa_request_items_representative_own" ON public.poa_request_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.representative_profile_id = auth.uid()
      AND pr.status IN ('draft','submitted')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.representative_profile_id = auth.uid()
      AND pr.status IN ('draft','submitted')
  )
  AND payment_status = 'unpaid'
);

CREATE TABLE IF NOT EXISTS public.poa_item_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_request_item_id UUID NOT NULL REFERENCES public.poa_request_items(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_date DATE,
  reference_no TEXT,
  slip_object_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poa_item_payments_item_id ON public.poa_item_payments(poa_request_item_id);

ALTER TABLE public.poa_item_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_item_payments_internal_all" ON public.poa_item_payments;

CREATE POLICY "poa_item_payments_internal_all" ON public.poa_item_payments
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_item_payments_representative_read" ON public.poa_item_payments;

CREATE POLICY "poa_item_payments_representative_read" ON public.poa_item_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.poa_request_items it
    JOIN public.poa_requests pr ON pr.id = it.poa_request_id
    WHERE it.id = poa_request_item_id
      AND pr.representative_profile_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.poa_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_request_id UUID NOT NULL REFERENCES public.poa_requests(id) ON DELETE CASCADE,
  pdf_object_path TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poa_documents_request_id ON public.poa_documents(poa_request_id);

ALTER TABLE public.poa_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_documents_internal_all" ON public.poa_documents;

CREATE POLICY "poa_documents_internal_all" ON public.poa_documents
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_documents_representative_read" ON public.poa_documents;

CREATE POLICY "poa_documents_representative_read" ON public.poa_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.representative_profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "poa_slips_read" ON storage.objects;

CREATE POLICY "poa_slips_read" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'poa_slips'
  AND (
    public.current_role() IN ('admin','operation')
    OR EXISTS (
      SELECT 1
      FROM public.poa_request_items it
      JOIN public.poa_requests pr ON pr.id = it.poa_request_id
      WHERE it.id = split_part(name, '/', 4)::uuid
        AND pr.representative_profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "poa_slips_write" ON storage.objects;

CREATE POLICY "poa_slips_write" ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'poa_slips'
  AND public.current_role() IN ('admin','operation')
)
WITH CHECK (
  bucket_id = 'poa_slips'
  AND public.current_role() IN ('admin','operation')
);

DROP POLICY IF EXISTS "poa_documents_read" ON storage.objects;

CREATE POLICY "poa_documents_read" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'poa_documents'
  AND (
    public.current_role() IN ('admin','operation')
    OR EXISTS (
      SELECT 1
      FROM public.poa_requests pr
      WHERE pr.id = split_part(name, '/', 2)::uuid
        AND pr.representative_profile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "poa_documents_write" ON storage.objects;

CREATE POLICY "poa_documents_write" ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'poa_documents'
  AND public.current_role() IN ('admin','operation')
)
WITH CHECK (
  bucket_id = 'poa_documents'
  AND public.current_role() IN ('admin','operation')
);

GRANT ALL PRIVILEGES ON public.poa_request_items TO authenticated;

GRANT ALL PRIVILEGES ON public.poa_item_payments TO authenticated;

GRANT ALL PRIVILEGES ON public.poa_documents TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS representative_import_temp_id TEXT;

ALTER TABLE public.poa_requests
  ALTER COLUMN representative_profile_id DROP NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_file_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_status_text TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS representative_name TEXT,
  ADD COLUMN IF NOT EXISTS representative_company_name TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.company_representatives
  ADD COLUMN IF NOT EXISTS profile_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_representatives_profile_id_fkey'
  ) THEN
    ALTER TABLE public.company_representatives
      ADD CONSTRAINT company_representatives_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_representatives_profile_id_unique
ON public.company_representatives(profile_id)
WHERE profile_id IS NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS representative_rep_code TEXT;

CREATE INDEX IF NOT EXISTS idx_poa_requests_representative_rep_code
ON public.poa_requests (representative_rep_code);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc ON public.customers (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_services_created_at_desc ON public.services (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_representatives_rep_code ON public.company_representatives (rep_code);

COMMIT;


BEGIN;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_role() = 'admin';
$$;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_deal_stages (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  stage_key TEXT NOT NULL,
  probability INTEGER NOT NULL DEFAULT 0,
  expected_close_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  owner_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_customer_id ON public.crm_deals (customer_id);

CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_key ON public.crm_deals (stage_key);

CREATE INDEX IF NOT EXISTS idx_crm_deals_status ON public.crm_deals (status);

CREATE INDEX IF NOT EXISTS idx_crm_deals_updated_at ON public.crm_deals (updated_at);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  deal_id UUID,
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

CREATE INDEX IF NOT EXISTS idx_crm_activities_customer_id ON public.crm_activities (customer_id);

CREATE INDEX IF NOT EXISTS idx_crm_activities_deal_id ON public.crm_activities (deal_id);

CREATE INDEX IF NOT EXISTS idx_crm_activities_due_at ON public.crm_activities (due_at);

CREATE INDEX IF NOT EXISTS idx_crm_activities_reminder_at ON public.crm_activities (reminder_at);

CREATE INDEX IF NOT EXISTS idx_crm_activities_completed_at ON public.crm_activities (completed_at);

ALTER TABLE public.crm_deal_stages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_deal_stages_internal_select" ON public.crm_deal_stages;

CREATE POLICY "crm_deal_stages_internal_select" ON public.crm_deal_stages
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "crm_deals_internal_all" ON public.crm_deals;

CREATE POLICY "crm_deals_internal_all" ON public.crm_deals
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "crm_activities_internal_all" ON public.crm_activities;

CREATE POLICY "crm_activities_internal_all" ON public.crm_activities
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT ON public.crm_deal_stages TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;

GRANT SELECT ON public.crm_deal_stages TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;


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


BEGIN;

ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS include_vat BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7;

ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS wht_rate NUMERIC(5,2) NOT NULL DEFAULT 3;

ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

DROP POLICY IF EXISTS "poa_request_types_read" ON public.poa_request_types;

CREATE POLICY "poa_request_types_read" ON public.poa_request_types
FOR SELECT
TO authenticated
USING (
  is_active = TRUE
  OR public.current_role() IN ('admin', 'operation')
);

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.poa_requests
  ADD COLUMN IF NOT EXISTS display_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poa_requests_display_id_unique
  ON public.poa_requests (display_id);

CREATE SEQUENCE IF NOT EXISTS public.poa_request_display_id_seq
  START 100001;

CREATE OR REPLACE FUNCTION public.assign_poa_display_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rep_code TEXT;
  seq BIGINT;
BEGIN
  IF NEW.representative_rep_code IS NULL OR length(trim(NEW.representative_rep_code)) = 0 THEN
    IF NEW.representative_import_temp_id IS NOT NULL AND length(trim(NEW.representative_import_temp_id)) > 0 THEN
      NEW.representative_rep_code := trim(NEW.representative_import_temp_id);
    ELSIF NEW.representative_profile_id IS NOT NULL THEN
      SELECT cr.rep_code
      INTO rep_code
      FROM public.company_representatives cr
      WHERE cr.profile_id = NEW.representative_profile_id
      LIMIT 1;

      IF rep_code IS NOT NULL AND length(trim(rep_code)) > 0 THEN
        NEW.representative_rep_code := trim(rep_code);
      END IF;
    END IF;
  END IF;

  IF NEW.display_id IS NULL OR length(trim(NEW.display_id)) = 0 THEN
    seq := nextval('public.poa_request_display_id_seq');
    NEW.display_id := 'POA' || seq::text || '-' || COALESCE(NULLIF(trim(NEW.representative_rep_code), ''), 'NA');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_poa_display_id ON public.poa_requests;

CREATE TRIGGER trg_assign_poa_display_id
BEFORE INSERT ON public.poa_requests
FOR EACH ROW
EXECUTE FUNCTION public.assign_poa_display_id();

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_poa_requests_paid_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_filtered JSONB;
  new_filtered JSONB;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('paid', 'completed', 'issued') THEN
    old_filtered := to_jsonb(OLD) - ARRAY['employer_address', 'employer_tel', 'employer_type', 'status'];
    new_filtered := to_jsonb(NEW) - ARRAY['employer_address', 'employer_tel', 'employer_type', 'status'];

    IF new_filtered IS DISTINCT FROM old_filtered THEN
      RAISE EXCEPTION 'คำขอชำระเงินแล้ว ไม่สามารถแก้ไขข้อมูลได้ (ยกเว้น ที่อยู่/โทร/ประเภทกิจการ)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_poa_requests_paid_lock ON public.poa_requests;

CREATE TRIGGER trg_enforce_poa_requests_paid_lock
BEFORE UPDATE ON public.poa_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_poa_requests_paid_lock();

NOTIFY pgrst, 'reload config';

COMMIT;


BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS representative_level TEXT CHECK (representative_level IN ('lead','member')),
  ADD COLUMN IF NOT EXISTS representative_lead_id UUID;

CREATE INDEX IF NOT EXISTS idx_profiles_representative_lead_id ON public.profiles(representative_lead_id);

DROP POLICY IF EXISTS "poa_requests_internal_all" ON public.poa_requests;

CREATE POLICY "poa_requests_internal_all" ON public.poa_requests
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_requests_representative_own" ON public.poa_requests;

CREATE POLICY "poa_requests_representative_own" ON public.poa_requests
FOR ALL
TO authenticated
USING (
  representative_profile_id = auth.uid()
  OR (
    public.current_role() = 'representative'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = representative_profile_id
        AND p.representative_lead_id = auth.uid()
    )
  )
)
WITH CHECK (representative_profile_id = auth.uid());

DROP POLICY IF EXISTS "poa_request_workers_internal_all" ON public.poa_request_workers;

CREATE POLICY "poa_request_workers_internal_all" ON public.poa_request_workers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_request_workers_representative_own" ON public.poa_request_workers;

CREATE POLICY "poa_request_workers_representative_own" ON public.poa_request_workers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND (
        pr.representative_profile_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = pr.representative_profile_id
            AND p.representative_lead_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.representative_profile_id = auth.uid()
  )
);

GRANT SELECT ON public.profiles TO anon;

GRANT ALL PRIVILEGES ON public.profiles TO authenticated;

GRANT SELECT ON public.poa_requests TO anon;

GRANT ALL PRIVILEGES ON public.poa_requests TO authenticated;

GRANT SELECT ON public.poa_request_workers TO anon;

GRANT ALL PRIVILEGES ON public.poa_request_workers TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;


NOTIFY pgrst, 'reload config';
