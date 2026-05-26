-- Multiple contacts per CRM client
CREATE TABLE IF NOT EXISTS crm_client_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  position   text,
  phone      text,
  email      text,
  line_id    text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_client_contacts_client_id_idx ON crm_client_contacts(client_id);
CREATE INDEX IF NOT EXISTS crm_client_contacts_org_id_idx    ON crm_client_contacts(org_id);

ALTER TABLE crm_client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_contacts_select" ON crm_client_contacts FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_contacts_insert" ON crm_client_contacts FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_contacts_update" ON crm_client_contacts FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_contacts_delete" ON crm_client_contacts FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
