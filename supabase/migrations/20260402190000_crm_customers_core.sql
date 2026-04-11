BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_deal_stages (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.crm_deal_stages (key, name, sort_order)
VALUES
  ('qualification', 'Qualification', 10),
  ('proposal', 'Proposal', 20),
  ('negotiation', 'Negotiation', 30),
  ('won', 'Won', 90),
  ('lost', 'Lost', 99)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  stage_key TEXT NOT NULL,
  probability INTEGER NOT NULL DEFAULT 0,
  expected_close_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  owner_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_customer_id ON public.crm_deals (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_key ON public.crm_deals (stage_key);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status ON public.crm_deals (status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_updated_at ON public.crm_deals (updated_at);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  deal_id UUID,
  type TEXT NOT NULL CHECK (type IN ('call','email','meeting','task')),
  subject TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to_profile_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_customer_id ON public.crm_activities (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal_id ON public.crm_activities (deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_due_at ON public.crm_activities (due_at);
CREATE INDEX IF NOT EXISTS idx_crm_activities_reminder_at ON public.crm_activities (reminder_at);
CREATE INDEX IF NOT EXISTS idx_crm_activities_completed_at ON public.crm_activities (completed_at);

ALTER TABLE public.crm_deal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_deal_stages_internal_select" ON public.crm_deal_stages;
CREATE POLICY "crm_deal_stages_internal_select" ON public.crm_deal_stages
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "crm_deals_internal_all" ON public.crm_deals;
CREATE POLICY "crm_deals_internal_all" ON public.crm_deals
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "crm_activities_internal_all" ON public.crm_activities;
CREATE POLICY "crm_activities_internal_all" ON public.crm_activities
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT ON public.crm_deal_stages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT SELECT ON public.crm_deal_stages TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;

