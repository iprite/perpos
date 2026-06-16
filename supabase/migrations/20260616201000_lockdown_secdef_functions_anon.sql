-- Lockdown: anon_security_definer_function_executable (Supabase security advisor WARN)
--
-- ปัญหา: ฟังก์ชัน SECURITY DEFINER ใน schema public ทั้งหมด (35 ตัว) ถูก
-- GRANT EXECUTE ให้ PUBLIC โดยอัตโนมัติตอนสร้าง → role `anon` (สมาชิกของ PUBLIC)
-- เรียกได้ทั้งหมด รวมถึง RPC บัญชีที่ละเอียดอ่อน (rpc_trial_balance, rpc_general_ledger,
-- create_invoice_and_post, rpc_inventory_*, rpc_*_wht_*, reconciliation ฯลฯ)
-- ฟังก์ชันพวกนี้รันด้วยสิทธิ์ owner (definer) → ถ้า anon เรียกได้ = ช่องโหว่
--
-- บริบทที่ตรวจแล้ว:
--   * ทุก RPC ที่ละเอียดอ่อนมี internal authz เช็ค org membership อยู่แล้ว
--     (is_org_member / organization_members) → ปลอดภัยสำหรับ authenticated
--   * ไม่มี flow ของ anon (ก่อน login) ที่ต้องเรียกฟังก์ชันเหล่านี้เลย —
--     LINE webhook / provisioning / magic-link / stripe webhook ใช้ service_role
--     (bypass grant) ส่วนหน้าเว็บบัญชีเรียกผ่าน server action = role authenticated
--   * trigger/helper functions (handle_new_user, audit_trigger_capture, is_org_member ...)
--     ถูกเรียกโดย trigger mechanism / ภายใน policy เป็น definer → ไม่พึ่ง grant ของ anon
--
-- วิธีแก้: REVOKE EXECUTE จาก PUBLIC + anon บนทุก SECURITY DEFINER function ใน public
--          คง authenticated ไว้ (แอปยังทำงานปกติ)
-- ทำแบบ dynamic เพื่อครอบคลุมทุกตัว + idempotent (รันซ้ำได้)

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authd
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- ตัด PUBLIC + anon ออก (ต้นเหตุที่ anon เรียกได้)
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
    -- คงสิทธิ์เดิมของ authenticated ไว้ (ตัวที่เคยให้ → ให้ต่อ)
    IF r.authd THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.sig);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
