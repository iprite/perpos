BEGIN;

ALTER TABLE IF EXISTS public.customers
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

ALTER TABLE IF EXISTS public.orders
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

ALTER TABLE IF EXISTS public.workers
ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;

