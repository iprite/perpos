BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS ops_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ops_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ops_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ops_updated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_ops_status_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_ops_status_check
  CHECK (ops_status IN ('not_started','in_progress','done'));

UPDATE public.order_items
SET ops_status = 'not_started'
WHERE ops_status IS NULL OR btrim(ops_status) = '';

CREATE INDEX IF NOT EXISTS idx_order_items_order_ops_status ON public.order_items(order_id, ops_status);

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.order_payments
SET confirmed_at = created_at
WHERE confirmed_at IS NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.recompute_order_payment_amounts(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  paid NUMERIC(12,2);
BEGIN
  SELECT round(COALESCE(sum(amount), 0), 2)
  INTO paid
  FROM public.order_payments
  WHERE order_id = target_order_id
    AND confirmed_at IS NOT NULL;

  UPDATE public.orders
  SET paid_amount = paid
  WHERE id = target_order_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_table TEXT,
  entity_id UUID,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_events_internal_read" ON public.order_events;
CREATE POLICY "order_events_internal_read" ON public.order_events
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "order_events_internal_write" ON public.order_events;
CREATE POLICY "order_events_internal_write" ON public.order_events
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_events TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;

