BEGIN;

CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc ON public.customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_services_created_at_desc ON public.services (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_representatives_rep_code ON public.company_representatives (rep_code);

COMMIT;

