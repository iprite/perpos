-- ── Phase 1c: Impersonation Sessions ─────────────────────────────────────────
-- Super admins can view the system as another user for support/debugging.
-- Sessions expire in 30 minutes. All access is fully audited.
--
-- NOTE: super_admin_id uses ON DELETE RESTRICT (can't delete a super admin
-- while they have active sessions). Change to SET NULL + make nullable if
-- needed in the future.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  target_user_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reason          text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  is_active       boolean     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS impersonation_sessions_admin_idx
  ON impersonation_sessions (super_admin_id, started_at DESC);

CREATE INDEX IF NOT EXISTS impersonation_sessions_active_idx
  ON impersonation_sessions (is_active, started_at DESC)
  WHERE is_active = true;

-- RLS: deny all public/anon/authenticated access; only service_role can write
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON impersonation_sessions FROM PUBLIC, anon, authenticated;
