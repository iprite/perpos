-- Accounting Firm Module: engagement metadata
-- Access control จริงยังอยู่ที่ organization_members + org_module_settings

CREATE TABLE acc_firm_clients (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_org_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  modules_managed  text[]      NOT NULL DEFAULT '{accounting}',
  status           text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'inactive', 'ended')),
  note             text,
  started_at       date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_org_id, client_org_id)
);

ALTER TABLE acc_firm_clients ENABLE ROW LEVEL SECURITY;

-- Super-admins can do anything
CREATE POLICY "super_admin_all" ON acc_firm_clients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- Members of the firm org can read their own client list
CREATE POLICY "firm_member_select" ON acc_firm_clients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = acc_firm_clients.firm_org_id
        AND om.user_id         = auth.uid()
    )
  );

-- Only firm org owners/admins can insert/update/delete
CREATE POLICY "firm_owner_write" ON acc_firm_clients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = acc_firm_clients.firm_org_id
        AND om.user_id         = auth.uid()
        AND om.role            IN ('owner', 'admin')
    )
  );
