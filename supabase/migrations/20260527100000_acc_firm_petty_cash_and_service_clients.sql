-- ============================================================
-- acc_firm_petty_cash  — บัญชีเงินสดย่อยของสำนักงานบัญชี
-- acc_firm_service_clients — รายชื่อลูกค้าบริการของสำนักงานบัญชี
-- ============================================================

-- 1. Petty Cash table
CREATE TABLE IF NOT EXISTS acc_firm_petty_cash (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_date  date NOT NULL,
  description text NOT NULL,
  company     text,
  category    text,
  payee       text,
  amount_out  numeric(12,2),
  amount_in   numeric(12,2),
  collected   numeric(12,2),
  note        text,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_firm_petty_cash_org_date_idx
  ON acc_firm_petty_cash (firm_org_id, entry_date DESC);

ALTER TABLE acc_firm_petty_cash ENABLE ROW LEVEL SECURITY;

-- firm members can read
CREATE POLICY "petty_cash_select"
  ON acc_firm_petty_cash FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = acc_firm_petty_cash.firm_org_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

-- firm members with write role can insert/update/delete
CREATE POLICY "petty_cash_write"
  ON acc_firm_petty_cash FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = acc_firm_petty_cash.firm_org_id
        AND user_id = auth.uid()
        AND is_active = true
        AND role IN ('owner','admin','team_lead')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = acc_firm_petty_cash.firm_org_id
        AND user_id = auth.uid()
        AND is_active = true
        AND role IN ('owner','admin','team_lead')
    )
  );

-- super admin full access
CREATE POLICY "petty_cash_super_admin"
  ON acc_firm_petty_cash FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 2. Service Clients table
CREATE TABLE IF NOT EXISTS acc_firm_service_clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_code   text NOT NULL,
  company_name  text NOT NULL,
  fee_2023      numeric(10,2),
  fee_2024      numeric(10,2),
  fee_2025      numeric(10,2),
  fee_2026      numeric(10,2),
  billing_note  text,
  -- service flags
  svc_invoice   boolean NOT NULL DEFAULT false,
  svc_billing   boolean NOT NULL DEFAULT false,
  svc_expense   boolean NOT NULL DEFAULT false,
  svc_sso       boolean NOT NULL DEFAULT false,
  svc_pp30      boolean NOT NULL DEFAULT false,
  svc_pnd       boolean NOT NULL DEFAULT false,
  svc_pnd51     boolean NOT NULL DEFAULT false,
  svc_pnd50     boolean NOT NULL DEFAULT false,
  svc_close_f   boolean NOT NULL DEFAULT false,
  note          text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_org_id, client_code)
);

CREATE INDEX IF NOT EXISTS acc_firm_service_clients_org_idx
  ON acc_firm_service_clients (firm_org_id);

ALTER TABLE acc_firm_service_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svc_clients_select"
  ON acc_firm_service_clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = acc_firm_service_clients.firm_org_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "svc_clients_write"
  ON acc_firm_service_clients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = acc_firm_service_clients.firm_org_id
        AND user_id = auth.uid()
        AND is_active = true
        AND role IN ('owner','admin','team_lead')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = acc_firm_service_clients.firm_org_id
        AND user_id = auth.uid()
        AND is_active = true
        AND role IN ('owner','admin','team_lead')
    )
  );

CREATE POLICY "svc_clients_super_admin"
  ON acc_firm_service_clients FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
