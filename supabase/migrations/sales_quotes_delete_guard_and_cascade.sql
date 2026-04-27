BEGIN;

UPDATE public.orders o
SET source_quote_id = NULL
WHERE o.source_quote_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.sales_quotes q
    WHERE q.id = o.source_quote_id
  );

DELETE FROM public.sales_quote_items i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sales_quotes q
  WHERE q.id = i.quote_id
);

DELETE FROM public.sales_followups f
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sales_quotes q
  WHERE q.id = f.quote_id
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_quote_items_quote_id_fkey') THEN
    EXECUTE 'ALTER TABLE public.sales_quote_items ADD CONSTRAINT sales_quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id) ON DELETE CASCADE NOT VALID';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_followups_quote_id_fkey') THEN
    EXECUTE 'ALTER TABLE public.sales_followups ADD CONSTRAINT sales_followups_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id) ON DELETE CASCADE NOT VALID';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_source_quote_id_fkey') THEN
    EXECUTE 'ALTER TABLE public.orders ADD CONSTRAINT orders_source_quote_id_fkey FOREIGN KEY (source_quote_id) REFERENCES public.sales_quotes(id) ON DELETE RESTRICT NOT VALID';
  END IF;
END;
$$;

ALTER TABLE public.sales_quote_items VALIDATE CONSTRAINT sales_quote_items_quote_id_fkey;
ALTER TABLE public.sales_followups VALIDATE CONSTRAINT sales_followups_quote_id_fkey;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_source_quote_id_fkey;

NOTIFY pgrst, 'reload config';

COMMIT;
