-- ============================================================================
-- bi: REVOKE สิทธิ์ EXECUTE ของ trigger function ออกจาก anon/authenticated
--
-- ที่มา: provisioning verify หลัง apply พบว่า migration ชุดแรก REVOKE ครบทั้ง 4 RPC
--        แต่ "ตกหล่น" trigger function fn_bi_strip_sensitive_rows()
--        (proacl = {=X/postgres, anon=X, authenticated=X, service_role=X})
--
-- ระดับความเสี่ยงจริง: ต่ำ — ทดสอบเรียกตรงแล้วได้
--        ERROR: trigger functions can only be called as triggers
--        จึงไม่มีข้อมูลรั่วและใช้โจมตีไม่ได้ แต่ปิดให้ตรงมาตรฐาน CONTEXT §7
--        ("SECURITY DEFINER ต้อง REVOKE จาก PUBLIC, anon, authenticated")
--        และเพื่อให้ advisors ไม่มี WARN ค้าง
-- ============================================================================

REVOKE ALL ON FUNCTION public.fn_bi_strip_sensitive_rows() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_bi_strip_sensitive_rows() FROM anon;
REVOKE ALL ON FUNCTION public.fn_bi_strip_sensitive_rows() FROM authenticated;

-- trigger ทำงานได้ต่อไปโดยไม่ต้อง GRANT ให้ใคร:
-- Postgres เรียก trigger function ในสิทธิ์ของ owner (postgres) ไม่ผ่าน ACL ของผู้เรียก
