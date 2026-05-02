BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS job_seq INT,
  ADD COLUMN IF NOT EXISTS job_display_id TEXT;

WITH ranked AS (
  SELECT
    oi.id,
    oi.order_id,
    COALESCE(NULLIF(btrim(o.display_id), ''), o.id::text) AS order_display_id,
    row_number() OVER (PARTITION BY oi.order_id ORDER BY oi.created_at, oi.id) AS seq
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
)
UPDATE public.order_items oi
SET
  job_seq = r.seq,
  job_display_id = r.order_display_id || '/' || lpad(r.seq::text, 2, '0')
FROM ranked r
WHERE oi.id = r.id
  AND (oi.job_display_id IS NULL OR btrim(oi.job_display_id) = '' OR oi.job_seq IS NULL);

CREATE OR REPLACE FUNCTION public.assign_order_item_job_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_no TEXT;
  next_seq INT;
BEGIN
  IF NEW.job_seq IS NULL OR NEW.job_seq < 1 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.order_id::text, 0));
    SELECT COALESCE(MAX(job_seq), 0) + 1 INTO next_seq
    FROM public.order_items
    WHERE order_id = NEW.order_id;
    NEW.job_seq := next_seq;
  END IF;

  IF NEW.job_display_id IS NULL OR btrim(NEW.job_display_id) = '' THEN
    SELECT o.display_id INTO order_no
    FROM public.orders o
    WHERE o.id = NEW.order_id;
    IF order_no IS NULL OR btrim(order_no) = '' THEN
      order_no := NEW.order_id::text;
    END IF;
    NEW.job_display_id := order_no || '/' || lpad(NEW.job_seq::text, 2, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_order_item_job_id ON public.order_items;
CREATE TRIGGER trg_assign_order_item_job_id
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_item_job_id();

ALTER TABLE public.order_items
  ALTER COLUMN job_seq SET NOT NULL,
  ALTER COLUMN job_display_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_order_id_job_seq_unique
  ON public.order_items(order_id, job_seq);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_job_display_id_unique
  ON public.order_items(job_display_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
