BEGIN;

CREATE OR REPLACE VIEW public.pat_provinces AS
SELECT DISTINCT province_th
FROM public.pat
WHERE province_th IS NOT NULL AND province_th <> '';

NOTIFY pgrst, 'reload config';

COMMIT;

