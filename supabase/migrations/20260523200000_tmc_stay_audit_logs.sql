-- ── TMC Stay Audit Log ────────────────────────────────────────────────────────
-- Immutable log of every create / update / delete on tmc_stays.
-- old_data and new_data are full-row snapshots (jsonb).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tmc_stay_audit_logs (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      uuid        NOT NULL,
  stay_id     uuid        NOT NULL,             -- the stay (may no longer exist)
  action      text        NOT NULL
    CHECK (action IN ('create', 'update', 'delete')),
  actor_id    uuid,                             -- null if system
  actor_email text,                             -- denormalised for history after user removal
  old_data    jsonb,                            -- full row before change (null on create)
  new_data    jsonb,                            -- full row after  change (null on delete)
  note        text,                             -- optional reason (required on delete)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tmc_stay_audit_logs_org_stay_idx
  ON tmc_stay_audit_logs (org_id, stay_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tmc_stay_audit_logs_org_time_idx
  ON tmc_stay_audit_logs (org_id, created_at DESC);

-- Org members can read audit logs for their org; only service_role can write.
ALTER TABLE tmc_stay_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view stay audit logs"
  ON tmc_stay_audit_logs FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON tmc_stay_audit_logs FROM PUBLIC, anon, authenticated;
