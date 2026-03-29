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

INSERT INTO public.poa_request_types (name, description, base_price, per_worker_price, is_active)
VALUES
  ('ขอหนังสือมอบอำนาจ (ทั่วไป)', 'ใช้สำหรับงานทั่วไป', 300, 250, TRUE),
  ('ขอหนังสือมอบอำนาจ (ยื่นเอกสาร)', 'ใช้สำหรับยื่นเอกสารที่หน่วยงาน', 400, 250, TRUE)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload config';

COMMIT;

