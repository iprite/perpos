-- ── Phase 2b: Label Override Manager ─────────────────────────────────────────
-- Allows per-org terminology customization without schema changes.
-- e.g. TMC can display "ค่าเช่า" instead of "รายรับ" everywhere.
-- Frontend uses useOrgLabels() hook which merges these over DEFAULT_LABELS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_label_overrides (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label_key  text        NOT NULL,  -- 'finance.income', 'nav.reports'
  locale     text        NOT NULL DEFAULT 'th'
    CHECK (locale IN ('th', 'en')),
  value      text        NOT NULL CHECK (value <> ''),
  updated_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, label_key, locale)
);

CREATE INDEX IF NOT EXISTS org_label_overrides_org_locale_idx
  ON org_label_overrides (org_id, locale);

-- RLS: org members can read their own overrides; only service_role can write
ALTER TABLE org_label_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view label overrides"
  ON org_label_overrides FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON org_label_overrides FROM PUBLIC, anon, authenticated;
