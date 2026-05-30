-- Initial migration for B2G module (b2g)
-- Created at: 2026-05-30

CREATE TABLE IF NOT EXISTS b2g_records (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE b2g_records ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: สมาชิกองค์กรสามารถดูข้อมูลได้ทุกคน
CREATE POLICY "b2g_records_select"
  ON b2g_records FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- WRITE Policy: ผู้ใช้ที่เป็น admin หรือเจ้าหน้าที่ที่เช็คสิทธิ์ผ่าน API layer
CREATE POLICY "b2g_records_write"
  ON b2g_records FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- สร้าง Index เพื่อความเร็วในการคิวรี่แยกองค์กร (Tenant Isolation Performance)
CREATE INDEX IF NOT EXISTS b2g_records_org_id_idx ON b2g_records(org_id);

-- ผูก Audit log trigger หากต้องการติดตามประวัติแก้ไข (Uncomment ด้านล่างเมื่อเปิดใช้)
-- CREATE TRIGGER b2g_records_audit
--   AFTER INSERT OR UPDATE OR DELETE ON b2g_records
--   FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

-- Register module in module_registry
INSERT INTO module_registry (key, label, href_slug, description, is_specific, is_builtin, is_active, sort_order)
VALUES ('b2g', 'B2G', 'b2g', 'โมดูลการทำงานเฉพาะองค์กร B2G', true, false, true, 100)
ON CONFLICT (key) DO NOTHING;

-- Enable for existing organizations by default
INSERT INTO org_module_settings (organization_id, module_key, is_enabled, allowed_roles)
SELECT id, 'b2g', true, ARRAY['owner','admin','team_lead','team_member']::text[]
FROM organizations
WHERE slug = 'p2p-x-89'
ON CONFLICT (organization_id, module_key) DO NOTHING;
