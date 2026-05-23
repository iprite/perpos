-- ── Phase 3a: API Request Metrics ────────────────────────────────────────────
-- Lightweight sampling table for per-org performance monitoring.
-- Each API route that wants to participate calls recordMetric() from
-- src/lib/metrics.ts (fire-and-forget, never blocks response).
--
-- Retention: rows older than 7 days should be cleaned up.
-- Suggested pg_cron job (run once, requires pg_cron extension):
--   SELECT cron.schedule('cleanup-metrics', '0 3 * * *',
--     $$DELETE FROM api_request_metrics WHERE logged_at < now() - interval '7 days'$$);
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_request_metrics (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  route       text        NOT NULL,    -- '/api/tmc/finance'
  method      text        NOT NULL,    -- 'GET' | 'POST' | ...
  duration_ms int         NOT NULL,    -- response time in ms
  status_code int         NOT NULL,    -- HTTP status
  logged_at   timestamptz NOT NULL DEFAULT now()
);

-- Partial indexes for common query patterns
CREATE INDEX IF NOT EXISTS api_metrics_org_time_idx
  ON api_request_metrics (org_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS api_metrics_time_idx
  ON api_request_metrics (logged_at DESC);

-- Deny direct client access; only service_role can write
ALTER TABLE api_request_metrics ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON api_request_metrics FROM PUBLIC, anon, authenticated;
