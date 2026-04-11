BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS representative_level TEXT CHECK (representative_level IN ('lead','member')),
  ADD COLUMN IF NOT EXISTS representative_lead_id UUID;

CREATE INDEX IF NOT EXISTS idx_profiles_representative_lead_id ON public.profiles(representative_lead_id);

DROP POLICY IF EXISTS "poa_requests_internal_all" ON public.poa_requests;
CREATE POLICY "poa_requests_internal_all" ON public.poa_requests
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_requests_representative_own" ON public.poa_requests;
CREATE POLICY "poa_requests_representative_own" ON public.poa_requests
FOR ALL
TO authenticated
USING (
  representative_profile_id = auth.uid()
  OR (
    public.current_role() = 'representative'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = representative_profile_id
        AND p.representative_lead_id = auth.uid()
    )
  )
)
WITH CHECK (representative_profile_id = auth.uid());

DROP POLICY IF EXISTS "poa_request_workers_internal_all" ON public.poa_request_workers;
CREATE POLICY "poa_request_workers_internal_all" ON public.poa_request_workers
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "poa_request_workers_representative_own" ON public.poa_request_workers;
CREATE POLICY "poa_request_workers_representative_own" ON public.poa_request_workers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND (
        pr.representative_profile_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = pr.representative_profile_id
            AND p.representative_lead_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.representative_profile_id = auth.uid()
  )
);

GRANT SELECT ON public.profiles TO anon;
GRANT ALL PRIVILEGES ON public.profiles TO authenticated;

GRANT SELECT ON public.poa_requests TO anon;
GRANT ALL PRIVILEGES ON public.poa_requests TO authenticated;
GRANT SELECT ON public.poa_request_workers TO anon;
GRANT ALL PRIVILEGES ON public.poa_request_workers TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;

