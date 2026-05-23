-- Tracks the last audit_logs.sequence_no successfully shipped to each destination.
-- Separate from audit_logs to preserve its immutability.
CREATE TABLE IF NOT EXISTS audit_ship_cursors (
  destination     text        PRIMARY KEY,
  last_seq        bigint      NOT NULL DEFAULT 0,
  last_shipped_at timestamptz,
  total_shipped   bigint      NOT NULL DEFAULT 0,
  error_count     int         NOT NULL DEFAULT 0,
  last_error      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed destinations we want to ship to
INSERT INTO audit_ship_cursors (destination) VALUES ('axiom')
  ON CONFLICT (destination) DO NOTHING;

ALTER TABLE audit_ship_cursors ENABLE ROW LEVEL SECURITY;

-- Only service_role (server-side) can read/write — no public access
CREATE POLICY "audit_ship_cursors_service"
  ON audit_ship_cursors
  USING (false)
  WITH CHECK (false);
