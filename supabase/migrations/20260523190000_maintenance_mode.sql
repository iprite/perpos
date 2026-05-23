-- ── Phase 4d: Maintenance Mode ────────────────────────────────────────────────
-- Adds maintenance_mode flag + optional message to organizations.
-- When true, the org's users see a maintenance page instead of the app.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS maintenance_mode    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message text;   -- null = use default message

CREATE INDEX IF NOT EXISTS organizations_maintenance_idx
  ON organizations (id) WHERE maintenance_mode = true;
