-- Add 'management' to organization_members role check constraint
-- Previously only: owner, admin, member
ALTER TABLE organization_members
  DROP CONSTRAINT organization_members_role_check,
  ADD CONSTRAINT organization_members_role_check
    CHECK (role = ANY (ARRAY['owner','admin','management','member']));
