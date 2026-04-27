BEGIN;

ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS task_list JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload config';

COMMIT;

