BEGIN;

CREATE OR REPLACE FUNCTION public.guard_order_documents_worker_in_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.order_item_workers oiw
    JOIN public.order_items oi ON oi.id = oiw.order_item_id
    WHERE oiw.worker_id = NEW.worker_id
      AND oi.order_id = NEW.order_id
  ) THEN
    RAISE EXCEPTION 'worker_not_in_this_order'
      USING ERRCODE = 'P0001',
            DETAIL = 'Worker must belong to the same order as the document';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;

