BEGIN;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS worker_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_worker_id_unique
  ON public.workers(worker_id)
  WHERE worker_id IS NOT NULL AND btrim(worker_id) <> '';

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS passport_type TEXT;

NOTIFY pgrst, 'reload config';

COMMIT;
