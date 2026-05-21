-- Rename organization_members.role values:
--   management → team_lead
--   member     → team_member
-- Also updates allowed_roles in org_module_settings (text[] column)

-- Step 1: Expand constraint to allow all four new values temporarily
ALTER TABLE organization_members
  DROP CONSTRAINT organization_members_role_check,
  ADD CONSTRAINT organization_members_role_check
    CHECK (role = ANY (ARRAY['owner','admin','management','member','team_lead','team_member']));

-- Step 2: Migrate existing data
UPDATE organization_members SET role = 'team_lead'   WHERE role = 'management';
UPDATE organization_members SET role = 'team_member' WHERE role = 'member';

-- Step 3: Tighten constraint to only allow new values
ALTER TABLE organization_members
  DROP CONSTRAINT organization_members_role_check,
  ADD CONSTRAINT organization_members_role_check
    CHECK (role = ANY (ARRAY['owner','admin','team_lead','team_member']));

-- Step 4: Update allowed_roles arrays in org_module_settings
UPDATE org_module_settings
SET allowed_roles = ARRAY(
  SELECT CASE
    WHEN r = 'management' THEN 'team_lead'
    WHEN r = 'member'     THEN 'team_member'
    ELSE r
  END
  FROM unnest(allowed_roles) AS r
)
WHERE allowed_roles && ARRAY['management','member'];
