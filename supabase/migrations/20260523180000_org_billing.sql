-- ── Phase 4b: Billing & Plan Manager ─────────────────────────────────────────
-- One row per org. Tracks plan tier + usage overrides + billing dates.
-- Plan defaults are enforced in application code (lib/billing.ts).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_billing (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_tier                 text        NOT NULL DEFAULT 'free'
    CHECK (plan_tier IN ('free', 'starter', 'pro', 'enterprise')),
  -- Override limits (null = use plan-tier defaults from application code)
  max_users                 int,
  max_api_requests_per_day  int,
  max_webhooks              int,
  max_custom_fields         int,
  -- Billing dates
  trial_ends_at             timestamptz,
  plan_starts_at            timestamptz,
  plan_ends_at              timestamptz,   -- null = no expiry / lifetime
  -- Admin notes
  notes                     text,
  updated_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_billing_plan_idx ON org_billing (plan_tier);
CREATE INDEX IF NOT EXISTS org_billing_trial_idx ON org_billing (trial_ends_at) WHERE trial_ends_at IS NOT NULL;

-- RLS
ALTER TABLE org_billing ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON org_billing FROM PUBLIC, anon, authenticated;

CREATE POLICY "org members can view billing"
  ON org_billing FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
