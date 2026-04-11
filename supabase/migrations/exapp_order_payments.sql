BEGIN;

CREATE TABLE IF NOT EXISTS public.order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  installment_no SMALLINT NOT NULL DEFAULT 1,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  slip_url TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_order_installment
  ON public.order_payments(order_id, installment_no);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_payments_admin_read" ON public.order_payments;
CREATE POLICY "order_payments_admin_read" ON public.order_payments
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_payments_admin_write" ON public.order_payments;
CREATE POLICY "order_payments_admin_write" ON public.order_payments
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

NOTIFY pgrst, 'reload config';

COMMIT;

