BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_group_code TEXT;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_service_group_code_check;

UPDATE public.services
SET service_group_code = CASE
  WHEN lower(coalesce(service_group, '')) LIKE '%mou%' THEN 'mou'
  WHEN lower(coalesce(service_group, '')) LIKE '%ขึ้นทะเบียน%' THEN 'registration'
  ELSE 'general'
END
WHERE service_group_code IS NULL;

ALTER TABLE public.services
  ALTER COLUMN service_group_code SET DEFAULT 'general';

UPDATE public.services
SET service_group_code = 'general'
WHERE service_group_code IS NULL;

ALTER TABLE public.services
  ALTER COLUMN service_group_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_services_service_group_code ON public.services(service_group_code);

ALTER TABLE public.services
  ADD CONSTRAINT services_service_group_code_check
  CHECK (service_group_code IN ('mou','registration','general'));

NOTIFY pgrst, 'reload config';

COMMIT;
