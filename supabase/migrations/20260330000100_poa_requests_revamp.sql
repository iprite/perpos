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

INSERT INTO storage.buckets (id, name, public)
VALUES ('poa_slips', 'poa_slips', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('poa_documents', 'poa_documents', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

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

