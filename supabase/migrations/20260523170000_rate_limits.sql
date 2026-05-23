-- ── Phase 4a: API Rate Limiting ───────────────────────────────────────────────
-- Per-org, per-route-pattern rate limit configuration.
-- Enforcement uses api_request_metrics for sliding-window counting.
-- Violations are logged for monitoring and alerting.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_rate_limits (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  route_pattern  text        NOT NULL DEFAULT '*',   -- '*' | '/api/tmc/*' | '/api/tmc/finance'
  window_seconds int         NOT NULL DEFAULT 60
    CHECK (window_seconds > 0 AND window_seconds <= 86400),
  max_requests   int         NOT NULL DEFAULT 1000
    CHECK (max_requests > 0),
  is_active      boolean     NOT NULL DEFAULT true,
  created_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, route_pattern)
);

CREATE INDEX IF NOT EXISTS tenant_rate_limits_org_idx
  ON tenant_rate_limits (org_id) WHERE is_active;

-- Log every time a limit is breached (for audit / alerting)
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  route         text        NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count int         NOT NULL,
  limit_value   int         NOT NULL,
  logged_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_violations_org_idx
  ON rate_limit_violations (org_id, logged_at DESC);

-- RLS
ALTER TABLE tenant_rate_limits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_violations ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON tenant_rate_limits    FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON rate_limit_violations FROM PUBLIC, anon, authenticated;

CREATE POLICY "org members can view rate limits"
  ON tenant_rate_limits FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
