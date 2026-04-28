BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_workplaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT,
  address TEXT NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_workplaces_customer_id ON public.customer_workplaces(customer_id);

ALTER TABLE public.customer_workplaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_workplaces_internal_all" ON public.customer_workplaces;
CREATE POLICY "customer_workplaces_internal_all" ON public.customer_workplaces
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_workplaces TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
