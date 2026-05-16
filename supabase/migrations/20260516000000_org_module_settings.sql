-- Per-org module access control
-- Allows admins to enable/disable modules per organization and restrict by member role

CREATE TABLE IF NOT EXISTS public.org_module_settings (
  organization_id uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_key      text    NOT NULL,
  is_enabled      boolean NOT NULL DEFAULT true,
  allowed_roles   text[]  NOT NULL DEFAULT ARRAY['owner','admin','member']::text[],
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, module_key)
);

ALTER TABLE public.org_module_settings ENABLE ROW LEVEL SECURITY;

-- System admin (profiles.role = 'admin') can manage all settings
CREATE POLICY "sys_admin_all" ON public.org_module_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Org members can read their own org's module settings (to filter the module switcher)
CREATE POLICY "org_member_read" ON public.org_module_settings FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);
