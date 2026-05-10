-- tax_pp30_filings
CREATE TABLE IF NOT EXISTS tax_pp30_filings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filing_number      text NOT NULL, -- PP30-YYYYMM-NNN
  period_year        int NOT NULL,  -- CE year e.g. 2026
  period_month       int NOT NULL,  -- 1-12
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','submitted','paid','received')),
  output_vat_total   numeric(18,2) NOT NULL DEFAULT 0,
  input_vat_total    numeric(18,2) NOT NULL DEFAULT 0,
  net_vat            numeric(18,2) NOT NULL DEFAULT 0,
  payment_amount     numeric(18,2),
  payment_ref        text,
  receipt_ref        text,
  submitted_at       date,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, filing_number)
);
CREATE INDEX IF NOT EXISTS tax_pp30_org_idx ON tax_pp30_filings (organization_id);
DROP POLICY IF EXISTS "org_member_all" ON tax_pp30_filings;
CREATE POLICY "org_member_all" ON tax_pp30_filings
  USING (EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = tax_pp30_filings.organization_id AND m.user_id = auth.uid()));
ALTER TABLE tax_pp30_filings ENABLE ROW LEVEL SECURITY;

-- tax_pnd_filings
CREATE TABLE IF NOT EXISTS tax_pnd_filings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pnd_type           text NOT NULL CHECK (pnd_type IN ('1','2','3','53')),
  filing_number      text NOT NULL,
  period_year        int NOT NULL,
  period_month       int NOT NULL,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','submitted','paid')),
  total_base_amount  numeric(18,2) NOT NULL DEFAULT 0,
  total_wht_amount   numeric(18,2) NOT NULL DEFAULT 0,
  submitted_at       date,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, filing_number)
);
CREATE INDEX IF NOT EXISTS tax_pnd_org_idx ON tax_pnd_filings (organization_id);
DROP POLICY IF EXISTS "org_member_all" ON tax_pnd_filings;
CREATE POLICY "org_member_all" ON tax_pnd_filings
  USING (EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = tax_pnd_filings.organization_id AND m.user_id = auth.uid()));
ALTER TABLE tax_pnd_filings ENABLE ROW LEVEL SECURITY;
