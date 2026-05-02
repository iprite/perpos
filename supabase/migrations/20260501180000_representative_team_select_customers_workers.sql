BEGIN;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_representative_team_select" ON public.customers;
CREATE POLICY "customers_representative_team_select" ON public.customers
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = created_by_profile_id
        AND p.representative_lead_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.customer_representatives cr
      JOIN public.profiles p ON p.id = cr.profile_id
      WHERE cr.customer_id = id
        AND cr.status = 'active'
        AND p.representative_lead_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "workers_representative_team_select" ON public.workers;
CREATE POLICY "workers_representative_team_select" ON public.workers
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = created_by_profile_id
        AND p.representative_lead_id = auth.uid()
    )
    OR (
      customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.customer_representatives cr
        JOIN public.profiles p ON p.id = cr.profile_id
        WHERE cr.customer_id = customer_id
          AND cr.status = 'active'
          AND p.representative_lead_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "customer_documents_representative_team_select" ON public.customer_documents;
CREATE POLICY "customer_documents_representative_team_select" ON public.customer_documents
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.profiles p ON p.id = c.created_by_profile_id
      WHERE c.id = customer_id
        AND p.representative_lead_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.customer_representatives cr
      JOIN public.profiles p ON p.id = cr.profile_id
      WHERE cr.customer_id = customer_id
        AND cr.status = 'active'
        AND p.representative_lead_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "worker_documents_representative_team_select" ON public.worker_documents;
CREATE POLICY "worker_documents_representative_team_select" ON public.worker_documents
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.workers w
    WHERE w.id = worker_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = w.created_by_profile_id
            AND p.representative_lead_id = auth.uid()
        )
        OR (
          w.customer_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.customer_representatives cr
            JOIN public.profiles p ON p.id = cr.profile_id
            WHERE cr.customer_id = w.customer_id
              AND cr.status = 'active'
              AND p.representative_lead_id = auth.uid()
          )
        )
      )
  )
);

NOTIFY pgrst, 'reload config';

COMMIT;

