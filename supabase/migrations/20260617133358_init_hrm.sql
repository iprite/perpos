-- Initial migration for HR module (hrm)
-- Created at: 2026-06-17

CREATE TABLE IF NOT EXISTS hrm_records (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE hrm_records ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: สมาชิกองค์กรสามารถดูข้อมูลได้ทุกคน
CREATE POLICY "hrm_records_select"
  ON hrm_records FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- WRITE Policy: ผู้ใช้ที่เป็น admin หรือเจ้าหน้าที่ที่เช็คสิทธิ์ผ่าน API layer
CREATE POLICY "hrm_records_write"
  ON hrm_records FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- สร้าง Index เพื่อความเร็วในการคิวรี่แยกองค์กร (Tenant Isolation Performance)
CREATE INDEX IF NOT EXISTS hrm_records_org_id_idx ON hrm_records(org_id);

-- ผูก Audit log trigger หากต้องการติดตามประวัติแก้ไข (Uncomment ด้านล่างเมื่อเปิดใช้)
-- CREATE TRIGGER hrm_records_audit
--   AFTER INSERT OR UPDATE OR DELETE ON hrm_records
--   FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

-- Register module in module_registry
INSERT INTO module_registry (key, label, href_slug, description, is_specific, is_builtin, is_active, sort_order)
VALUES ('hrm', 'HR', 'hrm', 'โมดูลการทำงานเฉพาะองค์กร HR', true, false, true, 100)
ON CONFLICT (key) DO NOTHING;


