-- ─── TMC Petty Cash ──────────────────────────────────────────────────────────
-- กระเป๋าเงินสดย่อยแยกจากบัญชีหลัก tmc_finance_entries

-- กองทุนเงินสดย่อย (อาจมีหลายกระเป๋า)
CREATE TABLE IF NOT EXISTS tmc_petty_cash_funds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  note        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- รายการเงินสดย่อย (เติมเงิน / ใช้เงิน)
CREATE TABLE IF NOT EXISTS tmc_petty_cash_txns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id       UUID NOT NULL REFERENCES tmc_petty_cash_funds(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  txn_date      DATE NOT NULL,
  txn_type      TEXT NOT NULL CHECK (txn_type IN ('top_up', 'expense')),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description   TEXT NOT NULL,
  category      TEXT,
  property_code TEXT,
  note          TEXT,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tmc_pcf_org      ON tmc_petty_cash_funds (org_id);
CREATE INDEX IF NOT EXISTS idx_tmc_pct_fund      ON tmc_petty_cash_txns  (fund_id);
CREATE INDEX IF NOT EXISTS idx_tmc_pct_org_date  ON tmc_petty_cash_txns  (org_id, txn_date DESC);

-- RLS
ALTER TABLE tmc_petty_cash_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmc_petty_cash_txns  ENABLE ROW LEVEL SECURITY;

-- org members can read
CREATE POLICY "tmc_pcf_select" ON tmc_petty_cash_funds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = org_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "tmc_pct_select" ON tmc_petty_cash_txns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = org_id AND user_id = auth.uid()
    )
  );

-- management+ can write funds
CREATE POLICY "tmc_pcf_insert" ON tmc_petty_cash_funds
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = org_id AND user_id = auth.uid()
        AND role IN ('owner','admin','management')
    )
  );

CREATE POLICY "tmc_pcf_update" ON tmc_petty_cash_funds
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = org_id AND user_id = auth.uid()
        AND role IN ('owner','admin','management')
    )
  );

-- team_lead+ can write transactions
CREATE POLICY "tmc_pct_insert" ON tmc_petty_cash_txns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = org_id AND user_id = auth.uid()
        AND role IN ('owner','admin','management','team_lead')
    )
  );

CREATE POLICY "tmc_pct_update" ON tmc_petty_cash_txns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = org_id AND user_id = auth.uid()
        AND role IN ('owner','admin','management','team_lead')
    )
  );

CREATE POLICY "tmc_pct_delete" ON tmc_petty_cash_txns
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = org_id AND user_id = auth.uid()
        AND role IN ('owner','admin','management')
    )
  );
