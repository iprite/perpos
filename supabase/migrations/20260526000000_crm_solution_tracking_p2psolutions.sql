-- CRM & Solution Tracking Module for p2psolutions org
-- ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  contact_name text,
  phone       text,
  email       text,
  address     text,
  industry    text,
  notes       text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','prospect')),
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_solutions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'lead'
                  CHECK (status IN ('lead','proposal','in_progress','on_hold','completed','cancelled')),
  priority      text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','urgent')),
  value         numeric(15,2),
  start_date    date,
  end_date      date,
  tags          text[] DEFAULT '{}',
  assigned_to   uuid REFERENCES profiles(id),
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_clients_org_id_idx ON crm_clients(org_id);
CREATE INDEX IF NOT EXISTS crm_clients_status_idx  ON crm_clients(status);
CREATE INDEX IF NOT EXISTS crm_solutions_org_id_idx    ON crm_solutions(org_id);
CREATE INDEX IF NOT EXISTS crm_solutions_client_id_idx ON crm_solutions(client_id);
CREATE INDEX IF NOT EXISTS crm_solutions_status_idx    ON crm_solutions(status);

ALTER TABLE crm_clients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_solutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_clients_select" ON crm_clients FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_clients_insert" ON crm_clients FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_clients_update" ON crm_clients FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_clients_delete" ON crm_clients FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_solutions_select" ON crm_solutions FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_solutions_insert" ON crm_solutions FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_solutions_update" ON crm_solutions FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_solutions_delete" ON crm_solutions FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_crm_clients_updated_at') THEN
    CREATE TRIGGER set_crm_clients_updated_at
      BEFORE UPDATE ON crm_clients
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_crm_solutions_updated_at') THEN
    CREATE TRIGGER set_crm_solutions_updated_at
      BEFORE UPDATE ON crm_solutions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
