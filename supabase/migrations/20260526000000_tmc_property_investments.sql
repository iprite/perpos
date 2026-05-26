-- Investment config per TMC property (investor return at fixed annual rate)
CREATE TABLE IF NOT EXISTS tmc_property_investments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_code   text NOT NULL,
  investment_amount numeric(18, 2) NOT NULL,
  annual_rate     numeric(6, 4)   NOT NULL DEFAULT 0.08,
  starts_at       date            NOT NULL,
  ends_at         date,
  note            text,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  UNIQUE(org_id, property_code)
);

ALTER TABLE tmc_property_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tmc_investments_select" ON tmc_property_investments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = tmc_property_investments.org_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "tmc_investments_write" ON tmc_property_investments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = tmc_property_investments.org_id
        AND om.user_id = auth.uid()
    )
  );
