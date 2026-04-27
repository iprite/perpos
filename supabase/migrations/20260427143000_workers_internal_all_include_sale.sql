BEGIN;

DROP POLICY IF EXISTS "workers_sale_select_all" ON public.workers;
DROP POLICY IF EXISTS "workers_sale_select_linked_orders" ON public.workers;
DROP POLICY IF EXISTS "workers_internal_all" ON public.workers;

CREATE POLICY "workers_internal_all" ON public.workers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "worker_documents_internal_all" ON public.worker_documents;

CREATE POLICY "worker_documents_internal_all" ON public.worker_documents
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

NOTIFY pgrst, 'reload config';

COMMIT;
