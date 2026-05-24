ALTER TABLE org_billing
  ADD COLUMN IF NOT EXISTS overdue_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_invoice_id text;

ALTER TABLE org_billing
  ALTER COLUMN payment_status SET DEFAULT 'trial';

ALTER TABLE org_billing
  DROP CONSTRAINT IF EXISTS org_billing_payment_status_check;

ALTER TABLE org_billing
  ADD CONSTRAINT org_billing_payment_status_check
    CHECK (payment_status IN ('trial', 'active', 'overdue', 'cancelled', 'pending'));

UPDATE org_billing
SET payment_status = 'trial'
WHERE (monthly_price IS NULL OR monthly_price <= 0)
  AND payment_status IN ('active', 'pending', 'cancelled');

CREATE OR REPLACE FUNCTION public.ensure_org_billing_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_billing (org_id, payment_status, monthly_price, updated_at)
  VALUES (NEW.id, 'trial', NULL, now())
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_org_billing_row ON public.organizations;
CREATE TRIGGER trg_ensure_org_billing_row
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.ensure_org_billing_row();
