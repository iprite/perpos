-- ── TMC Stay Audit Log — append-only จริง ─────────────────────────────────────
-- ทีมงาน (module_role ใดก็ได้) ลบรายการเข้าพักได้แล้ว ⇒ ร่องรอยต้องลบ/แก้ไม่ได้
-- แม้จะถือ service_role ก็ตาม (route เขียน log ด้วย admin client)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE UPDATE, DELETE ON tmc_stay_audit_logs FROM service_role;

-- INSERT ยังต้องได้ (route เขียน log ก่อนลบ stay เสมอ)
GRANT INSERT, SELECT ON tmc_stay_audit_logs TO service_role;
