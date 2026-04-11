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

