BEGIN;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_employer_org_select" ON public.invoices;
CREATE POLICY "invoices_employer_org_select" ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND customer_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = customer_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "invoices_representative_assigned_select" ON public.invoices;
CREATE POLICY "invoices_representative_assigned_select" ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND customer_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.customer_representatives cr
    WHERE cr.customer_id = customer_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

DROP POLICY IF EXISTS "invoice_items_employer_org_select" ON public.invoice_items;
CREATE POLICY "invoice_items_employer_org_select" ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.customers c ON c.id = i.customer_id
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE i.id = invoice_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "invoice_items_representative_assigned_select" ON public.invoice_items;
CREATE POLICY "invoice_items_representative_assigned_select" ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.customer_representatives cr ON cr.customer_id = i.customer_id
    WHERE i.id = invoice_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

DROP POLICY IF EXISTS "invoice_payments_employer_org_select" ON public.invoice_payments;
CREATE POLICY "invoice_payments_employer_org_select" ON public.invoice_payments
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'employer'
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.customers c ON c.id = i.customer_id
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE i.id = invoice_id
      AND om.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "invoice_payments_representative_assigned_select" ON public.invoice_payments;
CREATE POLICY "invoice_payments_representative_assigned_select" ON public.invoice_payments
FOR SELECT
TO authenticated
USING (
  public.current_role() = 'representative'
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.customer_representatives cr ON cr.customer_id = i.customer_id
    WHERE i.id = invoice_id
      AND cr.profile_id = auth.uid()
      AND cr.status = 'active'
  )
);

NOTIFY pgrst, 'reload config';

COMMIT;
