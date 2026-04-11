BEGIN;

GRANT SELECT ON TABLE public.order_item_documents TO authenticated;

CREATE INDEX IF NOT EXISTS idx_order_item_documents_order_id_created_at
  ON public.order_item_documents(order_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
