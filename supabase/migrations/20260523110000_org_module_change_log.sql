-- ============================================================
-- org_module_change_log — audit trail of module toggle actions
-- ============================================================
CREATE TABLE IF NOT EXISTS org_module_change_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key  text        NOT NULL,
  action      text        NOT NULL
    CHECK (action IN ('enabled','disabled','roles_updated','menu_roles_updated')),
  changed_by  uuid        NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  old_value   jsonb,
  new_value   jsonb,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_module_change_log_org_idx
  ON org_module_change_log (org_id, changed_at DESC);

-- Deny-all RLS — only accessible via service_role (createAdminClient)
ALTER TABLE org_module_change_log ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON org_module_change_log FROM PUBLIC, anon, authenticated;
