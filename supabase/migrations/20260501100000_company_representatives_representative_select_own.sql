BEGIN;

ALTER TABLE public.company_representatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_representatives_representative_select_own" ON public.company_representatives;
CREATE POLICY "company_representatives_representative_select_own" ON public.company_representatives
FOR SELECT
TO authenticated
USING (public.current_role() = 'representative' AND profile_id = auth.uid());

NOTIFY pgrst, 'reload config';

COMMIT;

