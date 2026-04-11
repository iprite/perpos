BEGIN;

ALTER TABLE public.company_representatives
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.company_representatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_representatives_admin_write" ON public.company_representatives;

DROP POLICY IF EXISTS "company_representatives_internal_select" ON public.company_representatives;
CREATE POLICY "company_representatives_internal_select" ON public.company_representatives
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "company_representatives_internal_insert" ON public.company_representatives;
CREATE POLICY "company_representatives_internal_insert" ON public.company_representatives
FOR INSERT
TO authenticated
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "company_representatives_internal_update" ON public.company_representatives;
CREATE POLICY "company_representatives_internal_update" ON public.company_representatives
FOR UPDATE
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "company_representatives_internal_delete" ON public.company_representatives;
CREATE POLICY "company_representatives_internal_delete" ON public.company_representatives
FOR DELETE
TO authenticated
USING (public.current_role() IN ('admin','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_representatives TO authenticated;

CREATE TABLE IF NOT EXISTS public.company_representative_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES public.company_representatives(id) ON DELETE CASCADE,
  doc_name TEXT NOT NULL,
  doc_type TEXT,
  drive_file_id TEXT,
  drive_web_view_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_company_representative_documents_set_updated_at ON public.company_representative_documents;
CREATE TRIGGER trg_company_representative_documents_set_updated_at
BEFORE UPDATE ON public.company_representative_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_company_representative_documents_rep_id
  ON public.company_representative_documents(representative_id);

ALTER TABLE public.company_representative_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_representative_documents_internal_select" ON public.company_representative_documents;
CREATE POLICY "company_representative_documents_internal_select" ON public.company_representative_documents
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "company_representative_documents_internal_write" ON public.company_representative_documents;
CREATE POLICY "company_representative_documents_internal_write" ON public.company_representative_documents
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_representative_documents TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;
