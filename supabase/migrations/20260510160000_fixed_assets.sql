-- Fixed Assets Module

CREATE TABLE IF NOT EXISTS fixed_assets (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_code                text NOT NULL,
  name                      text NOT NULL,
  asset_type                text NOT NULL DEFAULT 'equipment',
  purchase_date             date,
  cost                      numeric(15,2) NOT NULL DEFAULT 0,
  residual_value            numeric(15,2) NOT NULL DEFAULT 0,
  useful_life_months        int NOT NULL DEFAULT 60,
  depreciation_method       text NOT NULL DEFAULT 'straight_line',
  accumulated_depreciation  numeric(15,2) NOT NULL DEFAULT 0,
  asset_account_id          uuid REFERENCES accounts(id),
  depreciation_account_id   uuid REFERENCES accounts(id),
  accum_depr_account_id     uuid REFERENCES accounts(id),
  purchase_doc_id           uuid,
  disposal_date             date,
  disposal_amount           numeric(15,2),
  notes                     text,
  status                    text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'disposed', 'idle')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, asset_code)
);

CREATE INDEX IF NOT EXISTS fixed_assets_org_idx ON fixed_assets (organization_id);

DROP POLICY IF EXISTS "org_member_all" ON fixed_assets;
CREATE POLICY "org_member_all" ON fixed_assets
  USING (
    EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = fixed_assets.organization_id
        AND m.user_id = auth.uid()
    )
  );

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
