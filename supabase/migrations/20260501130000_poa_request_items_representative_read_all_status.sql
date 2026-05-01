BEGIN;

ALTER TABLE public.poa_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_request_items_representative_own" ON public.poa_request_items;
DROP POLICY IF EXISTS "poa_request_items_representative_read" ON public.poa_request_items;
DROP POLICY IF EXISTS "poa_request_items_representative_insert_pending" ON public.poa_request_items;
DROP POLICY IF EXISTS "poa_request_items_representative_update_pending" ON public.poa_request_items;
DROP POLICY IF EXISTS "poa_request_items_representative_delete_pending" ON public.poa_request_items;

CREATE POLICY "poa_request_items_representative_read" ON public.poa_request_items
FOR SELECT
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
);

CREATE POLICY "poa_request_items_representative_insert_pending" ON public.poa_request_items
FOR INSERT
TO authenticated
WITH CHECK (
  payment_status = 'unpaid'
  AND EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.status IN ('draft','submitted')
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
);

CREATE POLICY "poa_request_items_representative_update_pending" ON public.poa_request_items
FOR UPDATE
TO authenticated
USING (
  payment_status = 'unpaid'
  AND EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.status IN ('draft','submitted')
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
  payment_status = 'unpaid'
  AND EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.status IN ('draft','submitted')
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
);

CREATE POLICY "poa_request_items_representative_delete_pending" ON public.poa_request_items
FOR DELETE
TO authenticated
USING (
  payment_status = 'unpaid'
  AND EXISTS (
    SELECT 1
    FROM public.poa_requests pr
    WHERE pr.id = poa_request_id
      AND pr.status IN ('draft','submitted')
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
);

NOTIFY pgrst, 'reload config';

COMMIT;

