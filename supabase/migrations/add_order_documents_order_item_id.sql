BEGIN;

ALTER TABLE IF EXISTS public.order_documents
  ADD COLUMN IF NOT EXISTS order_item_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_documents_order_item_id_fkey'
  ) THEN
    ALTER TABLE public.order_documents
      ADD CONSTRAINT order_documents_order_item_id_fkey
      FOREIGN KEY (order_item_id)
      REFERENCES public.order_items(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_documents_order_item_id ON public.order_documents(order_item_id);

NOTIFY pgrst, 'reload schema';

COMMIT;

