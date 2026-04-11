BEGIN;

DROP POLICY IF EXISTS "poa_request_types_read" ON public.poa_request_types;

CREATE POLICY "poa_request_types_read" ON public.poa_request_types
FOR SELECT
TO authenticated
USING (
  is_active = TRUE
  OR public.current_role() IN ('admin', 'operation')
);

NOTIFY pgrst, 'reload config';

COMMIT;
