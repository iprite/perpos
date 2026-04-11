BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_representatives'
  ) THEN
    EXECUTE 'ALTER TABLE public.company_representatives ADD COLUMN IF NOT EXISTS email TEXT';

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'company_representatives' AND column_name = 'status'
    ) THEN
      UPDATE public.company_representatives
      SET status = 'พักใช้', updated_at = NOW()
      WHERE status = 'ไม่ปกติ';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_representatives'
  ) THEN
    EXECUTE $sql$
      CREATE TABLE IF NOT EXISTS public.company_representative_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        representative_id UUID NOT NULL REFERENCES public.company_representatives(id) ON DELETE CASCADE,
        doc_name TEXT NOT NULL,
        doc_type TEXT,
        drive_file_id TEXT,
        drive_web_view_link TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_representative_documents'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_company_representative_documents_set_updated_at ON public.company_representative_documents';
    EXECUTE $sql$
      CREATE TRIGGER trg_company_representative_documents_set_updated_at
      BEFORE UPDATE ON public.company_representative_documents
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at()
    $sql$;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_company_representative_documents_rep_id ON public.company_representative_documents(representative_id)';

    EXECUTE 'ALTER TABLE public.company_representative_documents ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "company_representative_documents_internal_select" ON public.company_representative_documents';
    EXECUTE $sql$
      CREATE POLICY "company_representative_documents_internal_select" ON public.company_representative_documents
      FOR SELECT
      TO authenticated
      USING (public.current_role() IN ('admin','sale','operation'))
    $sql$;

    EXECUTE 'DROP POLICY IF EXISTS "company_representative_documents_internal_write" ON public.company_representative_documents';
    EXECUTE $sql$
      CREATE POLICY "company_representative_documents_internal_write" ON public.company_representative_documents
      FOR ALL
      TO authenticated
      USING (public.current_role() IN ('admin','operation'))
      WITH CHECK (public.current_role() IN ('admin','operation'))
    $sql$;

    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_representative_documents TO authenticated';
  END IF;
END $$;

NOTIFY pgrst, 'reload config';

COMMIT;
