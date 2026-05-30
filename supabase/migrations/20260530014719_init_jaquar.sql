-- Initial migration for Jaquar module (jaquar)
-- Created at: 2026-05-30

CREATE TABLE IF NOT EXISTS jaquar_records (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE jaquar_records ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: สมาชิกองค์กรสามารถดูข้อมูลได้ทุกคน
CREATE POLICY "jaquar_records_select"
  ON jaquar_records FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- WRITE Policy: ผู้ใช้ที่เป็น admin หรือเจ้าหน้าที่ที่เช็คสิทธิ์ผ่าน API layer
CREATE POLICY "jaquar_records_write"
  ON jaquar_records FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- สร้าง Index เพื่อความเร็วในการคิวรี่แยกองค์กร (Tenant Isolation Performance)
CREATE INDEX IF NOT EXISTS jaquar_records_org_id_idx ON jaquar_records(org_id);

-- ผูก Audit log trigger หากต้องการติดตามประวัติแก้ไข (Uncomment ด้านล่างเมื่อเปิดใช้)
-- CREATE TRIGGER jaquar_records_audit
--   AFTER INSERT OR UPDATE OR DELETE ON jaquar_records
--   FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();
