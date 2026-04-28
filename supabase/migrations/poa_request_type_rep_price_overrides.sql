BEGIN;

CREATE TABLE IF NOT EXISTS public.poa_request_type_rep_price_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_code TEXT NOT NULL,
  poa_request_type_id UUID NOT NULL REFERENCES public.poa_request_types(id) ON DELETE CASCADE,
  unit_price_per_worker NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rep_code, poa_request_type_id)
);

CREATE INDEX IF NOT EXISTS idx_poa_rep_price_overrides_rep_code
  ON public.poa_request_type_rep_price_overrides(rep_code);

CREATE INDEX IF NOT EXISTS idx_poa_rep_price_overrides_type_id
  ON public.poa_request_type_rep_price_overrides(poa_request_type_id);

ALTER TABLE public.poa_request_type_rep_price_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_rep_price_overrides_read_internal" ON public.poa_request_type_rep_price_overrides;
CREATE POLICY "poa_rep_price_overrides_read_internal" ON public.poa_request_type_rep_price_overrides
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "poa_rep_price_overrides_read_representative" ON public.poa_request_type_rep_price_overrides;
CREATE POLICY "poa_rep_price_overrides_read_representative" ON public.poa_request_type_rep_price_overrides
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_representatives cr
    WHERE cr.profile_id = auth.uid()
      AND cr.rep_code = rep_code
  )
);

DROP POLICY IF EXISTS "poa_rep_price_overrides_admin_insert" ON public.poa_request_type_rep_price_overrides;
CREATE POLICY "poa_rep_price_overrides_admin_insert" ON public.poa_request_type_rep_price_overrides
FOR INSERT
TO authenticated
WITH CHECK (public.current_role() = 'admin');

DROP POLICY IF EXISTS "poa_rep_price_overrides_admin_update" ON public.poa_request_type_rep_price_overrides;
CREATE POLICY "poa_rep_price_overrides_admin_update" ON public.poa_request_type_rep_price_overrides
FOR UPDATE
TO authenticated
USING (public.current_role() = 'admin')
WITH CHECK (public.current_role() = 'admin');

DROP POLICY IF EXISTS "poa_rep_price_overrides_admin_delete" ON public.poa_request_type_rep_price_overrides;
CREATE POLICY "poa_rep_price_overrides_admin_delete" ON public.poa_request_type_rep_price_overrides
FOR DELETE
TO authenticated
USING (public.current_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poa_request_type_rep_price_overrides TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
