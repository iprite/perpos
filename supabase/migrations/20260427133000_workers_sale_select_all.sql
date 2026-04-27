BEGIN;

DROP POLICY IF EXISTS "workers_sale_select_linked_orders" ON public.workers;
DROP POLICY IF EXISTS "workers_sale_select_all" ON public.workers;

CREATE POLICY "workers_sale_select_all" ON public.workers
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

NOTIFY pgrst, 'reload config';

COMMIT;
