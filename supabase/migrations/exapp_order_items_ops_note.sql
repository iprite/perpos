BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS ops_note TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;

