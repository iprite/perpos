BEGIN;

ALTER TABLE public.order_documents
  ADD COLUMN IF NOT EXISTS order_item_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_documents_order_item_id_fkey') THEN
    EXECUTE 'ALTER TABLE public.order_documents ADD CONSTRAINT order_documents_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_order_documents_order_item_in_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it_order_id uuid;
BEGIN
  IF NEW.order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT oi.order_id INTO it_order_id
  FROM public.order_items oi
  WHERE oi.id = NEW.order_item_id;

  IF it_order_id IS NULL THEN
    RAISE EXCEPTION 'order_item_not_found'
      USING ERRCODE = 'P0001',
            DETAIL = 'Order item does not exist';
  END IF;

  IF it_order_id <> NEW.order_id THEN
    RAISE EXCEPTION 'order_item_not_in_this_order'
      USING ERRCODE = 'P0001',
            DETAIL = 'Order item must belong to the same order as the document';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_documents_order_item_in_order ON public.order_documents;
CREATE TRIGGER trg_guard_order_documents_order_item_in_order
BEFORE INSERT OR UPDATE OF order_item_id, order_id ON public.order_documents
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_documents_order_item_in_order();

CREATE INDEX IF NOT EXISTS idx_order_documents_order_item_id ON public.order_documents(order_item_id);

NOTIFY pgrst, 'reload config';

COMMIT;

