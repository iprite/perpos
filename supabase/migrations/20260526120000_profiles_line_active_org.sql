-- Add line_active_org_id to profiles.
-- Tracks which org is the "active" context for LINE bot commands.
-- Auto-populated on first command; user can switch with /org command.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS line_active_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.line_active_org_id IS 'Active org for LINE bot command routing. Set automatically on first use; user can switch via /org command.';
