BEGIN;

DROP POLICY IF EXISTS "pat_admin_read" ON public.pat;
DROP POLICY IF EXISTS "pat_internal_read" ON public.pat;
CREATE POLICY "pat_internal_read" ON public.pat
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin', 'sale', 'operation'));

CREATE OR REPLACE VIEW public.pat_provinces AS
SELECT DISTINCT province_th
FROM public.pat
WHERE province_th IS NOT NULL AND province_th <> '';

NOTIFY pgrst, 'reload config';

COMMIT;
