BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS service_group TEXT,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_detail TEXT,
  ADD COLUMN IF NOT EXISTS task_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.services
SET cost = COALESCE(cost, base_price)
WHERE cost IS NULL;

UPDATE public.services
SET job_id = COALESCE(job_id, 'JOB-' || substring(id::text, 1, 8))
WHERE job_id IS NULL;

ALTER TABLE public.services
  ALTER COLUMN job_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_job_id_unique ON public.services(job_id);
CREATE INDEX IF NOT EXISTS idx_services_service_group ON public.services(service_group);

DROP POLICY IF EXISTS "services_internal_write" ON public.services;
CREATE POLICY "services_admin_write" ON public.services
FOR ALL
TO authenticated
USING (public.current_role() = 'admin')
WITH CHECK (public.current_role() = 'admin');

NOTIFY pgrst, 'reload config';

COMMIT;
