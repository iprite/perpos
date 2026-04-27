BEGIN;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS workplace_id UUID REFERENCES public.customer_workplaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_workplace_id ON public.workers(workplace_id);

NOTIFY pgrst, 'reload config';

COMMIT;
