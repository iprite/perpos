BEGIN;

GRANT SELECT ON TABLE public.order_item_documents TO anon;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
