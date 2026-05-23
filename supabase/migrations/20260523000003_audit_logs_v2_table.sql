-- ============================================================
-- Audit Logs v2 — tamper-evident system-wide audit log
-- Part 1/3: Drop old table (0 rows), create new schema
-- ============================================================

-- Drop old schema-mismatched table (0 rows, safe)
DROP TABLE IF EXISTS audit_logs;

-- Tamper-evident audit log with hash chain
CREATE TABLE audit_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no  bigint      GENERATED ALWAYS AS IDENTITY,   -- gap detection
  org_id       uuid        REFERENCES organizations(id)   ON DELETE SET NULL,
  actor_id     uuid        REFERENCES profiles(id)         ON DELETE SET NULL,
  action       text        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  table_name   text        NOT NULL,
  record_id    uuid,
  old_data     jsonb,
  new_data     jsonb,
  diff_keys    text[],
  payload_hash text        NOT NULL,   -- SHA-256 of canonical payload JSON
  chain_hash   text        NOT NULL,   -- SHA-256(prev_chain_hash || payload_hash)
  ip_address   text,
  user_agent   text,
  request_id   text,
  logged_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_table_seq_idx ON audit_logs (table_name, sequence_no);
CREATE INDEX audit_logs_record_idx    ON audit_logs (table_name, record_id);
CREATE INDEX audit_logs_actor_idx     ON audit_logs (actor_id,   logged_at DESC);
CREATE INDEX audit_logs_logged_at_idx ON audit_logs (logged_at   DESC);

-- RLS: only admins can read; nobody can write directly (only trigger can)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_admin"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Belt-and-suspenders: revoke direct write from all roles
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM authenticated;
