BEGIN;

ALTER TABLE public.order_documents
  ADD COLUMN IF NOT EXISTS worker_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_documents_worker_id_fkey') THEN
    EXECUTE 'ALTER TABLE public.order_documents ADD CONSTRAINT order_documents_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_order_documents_worker_in_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w_order_id uuid;
BEGIN
  IF NEW.worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.order_id INTO w_order_id
  FROM public.workers w
  WHERE w.id = NEW.worker_id;

  IF w_order_id IS NULL THEN
    RAISE EXCEPTION 'worker_not_found_or_not_in_order'
      USING ERRCODE = 'P0001',
            DETAIL = 'Worker has no order_id or does not exist';
  END IF;

  IF w_order_id <> NEW.order_id THEN
    RAISE EXCEPTION 'worker_not_in_this_order'
      USING ERRCODE = 'P0001',
            DETAIL = 'Worker must belong to the same order as the document';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_documents_worker_in_order ON public.order_documents;
CREATE TRIGGER trg_guard_order_documents_worker_in_order
BEFORE INSERT OR UPDATE OF worker_id, order_id ON public.order_documents
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_documents_worker_in_order();

CREATE INDEX IF NOT EXISTS idx_order_documents_worker_id ON public.order_documents(worker_id);

NOTIFY pgrst, 'reload config';

COMMIT;

