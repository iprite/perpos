BEGIN;

CREATE TABLE IF NOT EXISTS public.order_item_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  doc_type TEXT,
  drive_file_id TEXT,
  drive_web_view_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_provider TEXT NOT NULL DEFAULT 'drive',
  gcs_bucket TEXT,
  gcs_object_path TEXT,
  file_url TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_bucket TEXT,
  storage_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_item_documents_order_id ON public.order_item_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_documents_order_item_id ON public.order_item_documents(order_item_id);

ALTER TABLE public.order_item_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_item_documents_internal_all" ON public.order_item_documents;

CREATE POLICY "order_item_documents_internal_all" ON public.order_item_documents
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_item_documents_employer_select" ON public.order_item_documents;

CREATE POLICY "order_item_documents_employer_select" ON public.order_item_documents
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

DROP POLICY IF EXISTS "order_item_documents_representative_select" ON public.order_item_documents;

CREATE POLICY "order_item_documents_representative_select" ON public.order_item_documents
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

ALTER TABLE IF EXISTS public.order_documents
  DROP CONSTRAINT IF EXISTS order_documents_order_item_id_fkey;

DROP INDEX IF EXISTS public.idx_order_documents_order_item_id;

ALTER TABLE IF EXISTS public.order_documents
  DROP COLUMN IF EXISTS order_item_id;

NOTIFY pgrst, 'reload schema';

COMMIT;

