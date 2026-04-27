BEGIN;

UPDATE public.workers
SET worker_id = NULL
WHERE worker_id IS NOT NULL
  AND btrim(worker_id) = '';

DROP INDEX IF EXISTS public.idx_workers_worker_id_unique;

CREATE UNIQUE INDEX idx_workers_worker_id_unique
  ON public.workers(worker_id)
  WHERE worker_id IS NOT NULL AND btrim(worker_id) <> '';

NOTIFY pgrst, 'reload config';

COMMIT;
