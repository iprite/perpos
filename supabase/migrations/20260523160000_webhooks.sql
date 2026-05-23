-- ── Phase 3b: Webhook Gateway ─────────────────────────────────────────────────
-- Allows per-org external integrations via HTTP webhooks.
-- Publisher: src/lib/webhooks/publish.ts
-- Admin UI:  /admin/webhooks
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_webhooks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  url           text        NOT NULL,
  event_types   text[]      NOT NULL DEFAULT '{}',   -- e.g. ['finance.entry.created']
  signing_secret text,                                -- plaintext HMAC key (rotate periodically)
  is_active     boolean     NOT NULL DEFAULT true,
  timeout_ms    int         NOT NULL DEFAULT 10000,
  retry_count   int         NOT NULL DEFAULT 3,
  created_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT url_not_internal CHECK (
    url ~* '^https?://' AND
    url !~* '^https?://(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
  )
);

CREATE INDEX IF NOT EXISTS tenant_webhooks_org_idx
  ON tenant_webhooks (org_id, is_active);

CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      uuid        NOT NULL REFERENCES tenant_webhooks(id) ON DELETE CASCADE,
  event_type      text        NOT NULL,
  payload         jsonb       NOT NULL,
  response_status int,
  response_body   text,
  latency_ms      int,
  attempt_no      int         NOT NULL DEFAULT 1,
  success         boolean     NOT NULL DEFAULT false,
  delivered_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_delivery_webhook_idx
  ON webhook_delivery_logs (webhook_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS webhook_delivery_time_idx
  ON webhook_delivery_logs (delivered_at DESC);

-- RLS: deny direct client writes; service_role only
ALTER TABLE tenant_webhooks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Org members can read their own webhooks (frontend overview)
CREATE POLICY "org members can view webhooks"
  ON tenant_webhooks FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON tenant_webhooks       FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON webhook_delivery_logs FROM PUBLIC, anon, authenticated;
