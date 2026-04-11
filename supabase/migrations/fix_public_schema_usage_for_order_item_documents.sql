BEGIN;

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE public.order_item_documents TO anon;
GRANT SELECT ON TABLE public.order_item_documents TO authenticated;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
