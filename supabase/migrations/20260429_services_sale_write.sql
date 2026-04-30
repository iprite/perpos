BEGIN;

DROP POLICY IF EXISTS "services_admin_write" ON public.services;
DROP POLICY IF EXISTS "services_internal_write" ON public.services;

CREATE POLICY "services_internal_write" ON public.services
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

NOTIFY pgrst, 'reload config';

COMMIT;

