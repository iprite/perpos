-- org_menu_settings: per-menu role permissions within a module
CREATE TABLE IF NOT EXISTS org_menu_settings (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key      text NOT NULL,
  menu_key        text NOT NULL,
  allowed_roles   text[] NOT NULL DEFAULT ARRAY['owner','admin','team_lead','team_member'],
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, module_key, menu_key)
);

ALTER TABLE org_menu_settings ENABLE ROW LEVEL SECURITY;

-- Only service role (admin client) can access — all user-facing access blocked by default
CREATE POLICY "no_direct_access" ON org_menu_settings
  USING (false)
  WITH CHECK (false);
