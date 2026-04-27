BEGIN;

DROP POLICY IF EXISTS "workers_sale_select_linked_orders" ON public.workers;
CREATE POLICY "workers_sale_select_linked_orders" ON public.workers
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'sale'
  AND (
    created_by_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.order_item_workers oiw
      JOIN public.order_items oi ON oi.id = oiw.order_item_id
      WHERE oiw.worker_id = workers.id
    )
  )
);

NOTIFY pgrst, 'reload config';

COMMIT;

