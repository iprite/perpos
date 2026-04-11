BEGIN;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check1;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft','pending_approval','approved','rejected','in_progress','completed','cancelled'));

NOTIFY pgrst, 'reload config';

COMMIT;
