-- ============================================================
-- Module Members — per-module membership with per-module roles
-- ============================================================
-- Each specific/org-custom module (TMC, future modules) needs its
-- own member list, separate from organization_members.
-- org_module_settings tracks which modules are ENABLED per org.
-- module_members tracks WHO can access each module and with what role.

CREATE TABLE IF NOT EXISTS module_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  module_key  text        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  module_role text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  invited_by  uuid        REFERENCES profiles(id)                ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT module_members_unique UNIQUE (org_id, module_key, user_id)
);

CREATE INDEX IF NOT EXISTS module_members_org_module_idx
  ON module_members (org_id, module_key);

CREATE INDEX IF NOT EXISTS module_members_user_idx
  ON module_members (user_id);

-- ---- RLS -------------------------------------------------------
ALTER TABLE module_members ENABLE ROW LEVEL SECURITY;

-- Org members can read module membership list (to see teammates)
CREATE POLICY "module_members_select"
  ON module_members FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Only org admins (owner/admin role in organization_members) can manage
CREATE POLICY "module_members_insert"
  ON module_members FOR INSERT
  WITH CHECK (is_org_admin(org_id, auth.uid()));

CREATE POLICY "module_members_update"
  ON module_members FOR UPDATE
  USING (is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_org_admin(org_id, auth.uid()));

CREATE POLICY "module_members_delete"
  ON module_members FOR DELETE
  USING (is_org_admin(org_id, auth.uid()));

-- ---- Migrate existing TMC members ------------------------------
-- TMC org already has members in organization_members; seed them
-- into module_members so there is no access regression.
-- Role mapping: org role → tmc module role (same set for TMC).
DO $$
DECLARE
  v_tmc_org_id uuid := '1f52618c-09c4-49c5-a929-ea5060f26e7d';
BEGIN
  -- Only run if TMC org exists and module_members is empty for TMC
  IF EXISTS (SELECT 1 FROM organizations WHERE id = v_tmc_org_id)
     AND NOT EXISTS (SELECT 1 FROM module_members WHERE org_id = v_tmc_org_id AND module_key = 'tmc')
  THEN
    INSERT INTO module_members (org_id, module_key, user_id, module_role, is_active, created_at)
    SELECT
      v_tmc_org_id,
      'tmc',
      user_id,
      role,           -- org role matches tmc module role values exactly
      true,
      created_at
    FROM organization_members
    WHERE organization_id = v_tmc_org_id
    ON CONFLICT (org_id, module_key, user_id) DO NOTHING;
  END IF;
END;
$$;
