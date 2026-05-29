CREATE TABLE IF NOT EXISTS module_registry (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  label       text NOT NULL,
  href_slug   text NOT NULL,
  description text,
  is_specific boolean NOT NULL DEFAULT false,
  is_builtin  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE module_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_registry_read_admin"
  ON module_registry FOR SELECT USING (true);

CREATE POLICY "module_registry_write_admin"
  ON module_registry FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

INSERT INTO module_registry (key, label, href_slug, description, is_specific, is_builtin, is_active, sort_order) VALUES
  ('accounting', 'Accounting',        'accounting', 'บัญชี รายรับรายจ่าย ภาษี สินค้า',             false, true, true, 1),
  ('payroll',    'Payroll',           'payroll',    'เงินเดือน พนักงาน แผนก',                      false, true, true, 2),
  ('assistant',  'Assistant',         'assistant',  'Task Manager AI แจ้งเตือนผ่าน LINE',           false, true, true, 3),
  ('tmc',        'TMC Management',    'tmc',        'บริหารหมู่บ้าน/รีสอร์ท เฉพาะองค์กร',          true,  true, true, 4),
  ('crm',        'CRM & Solutions',   'crm',        'ลูกค้า Sales Pipeline เฉพาะองค์กร',            true,  true, true, 5),
  ('acc_firm',   'สำนักงานบัญชี',   'acc-firm',   'สำนักงานบัญชี บริหาร client orgs',             true,  true, true, 6)
ON CONFLICT (key) DO NOTHING;
ALTER TABLE module_registry ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
