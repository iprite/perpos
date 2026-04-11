BEGIN;

-- Add Supabase Storage metadata columns for documents

ALTER TABLE IF EXISTS public.customer_documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

ALTER TABLE IF EXISTS public.order_documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

ALTER TABLE IF EXISTS public.worker_documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'drive',
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

-- legacy Drive links should be nullable to allow storage-only records
ALTER TABLE IF EXISTS public.customer_documents
  ALTER COLUMN drive_web_view_link DROP NOT NULL;

ALTER TABLE IF EXISTS public.order_documents
  ALTER COLUMN drive_web_view_link DROP NOT NULL;

ALTER TABLE IF EXISTS public.worker_documents
  ALTER COLUMN drive_web_view_link DROP NOT NULL;

-- Slips: add Supabase Storage metadata columns
ALTER TABLE IF EXISTS public.order_payments
  ADD COLUMN IF NOT EXISTS slip_storage_provider TEXT NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS slip_storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS slip_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS slip_file_name TEXT,
  ADD COLUMN IF NOT EXISTS slip_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS slip_size_bytes BIGINT;

ALTER TABLE IF EXISTS public.order_refunds
  ALTER COLUMN slip_url DROP NOT NULL;

ALTER TABLE IF EXISTS public.order_refunds
  ADD COLUMN IF NOT EXISTS slip_storage_provider TEXT NOT NULL DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS slip_storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS slip_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS slip_file_name TEXT,
  ADD COLUMN IF NOT EXISTS slip_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS slip_size_bytes BIGINT;

CREATE INDEX IF NOT EXISTS idx_order_documents_storage_path ON public.order_documents(storage_path);
CREATE INDEX IF NOT EXISTS idx_worker_documents_storage_path ON public.worker_documents(storage_path);
CREATE INDEX IF NOT EXISTS idx_customer_documents_storage_path ON public.customer_documents(storage_path);

NOTIFY pgrst, 'reload config';

COMMIT;

