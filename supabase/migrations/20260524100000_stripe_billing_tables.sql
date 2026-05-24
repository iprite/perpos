BEGIN;

CREATE TABLE IF NOT EXISTS public.org_stripe (
  org_id                  uuid        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id      text        UNIQUE,
  stripe_subscription_id  text        UNIQUE,
  stripe_price_id         text,
  subscription_status     text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean     NOT NULL DEFAULT false,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_stripe_customer_id_idx     ON public.org_stripe (stripe_customer_id)     WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_stripe_subscription_id_idx ON public.org_stripe (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.org_stripe ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.org_stripe FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS org_stripe_select_admin ON public.org_stripe;
CREATE POLICY org_stripe_select_admin
  ON public.org_stripe
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(org_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id                text        PRIMARY KEY,
  type              text        NOT NULL,
  org_id            uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  stripe_created_at timestamptz,
  payload           jsonb       NOT NULL,
  inserted_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_events_type_idx   ON public.stripe_events (type);
CREATE INDEX IF NOT EXISTS stripe_events_org_id_idx ON public.stripe_events (org_id) WHERE org_id IS NOT NULL;

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.stripe_events FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS stripe_events_select_super_admin ON public.stripe_events;
CREATE POLICY stripe_events_select_super_admin
  ON public.stripe_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

NOTIFY pgrst, 'reload config';

COMMIT;

