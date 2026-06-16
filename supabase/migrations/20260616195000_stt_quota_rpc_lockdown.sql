-- 🔒 SECURITY FIX (critical) — ล็อก RPC โควต้า STT ให้ service_role เท่านั้น
--
-- ปัญหา: consume_stt_quota / refund_stt_quota / refund_stt_job ถูกสร้างโดย REVOKE จาก PUBLIC อย่างเดียว
--   แต่ Supabase grant EXECUTE ให้ role `anon` + `authenticated` เป็น default → REVOKE FROM PUBLIC ไม่ครอบคลุม
--   ผล: ใครก็ตามที่มี anon key (เปิดเผยใน frontend) ยิง POST /rest/v1/rpc/refund_stt_quota
--        { p_profile_id, p_seconds: 999999 } เพิ่มโควต้าตัวเองไม่จำกัด = แกะเสียงฟรีไม่อั้น บายพาส quota ทั้งระบบ
--
-- แก้: REVOKE EXECUTE จาก anon + authenticated ตรง ๆ (เหลือ service_role ที่ใช้ใน stt-worker/API เท่านั้น)
-- ตรวจด้วย: has_function_privilege('authenticated', oid, 'EXECUTE') = false

REVOKE EXECUTE ON FUNCTION public.consume_stt_quota(uuid, int, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_stt_quota(uuid, int, uuid)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_stt_job(uuid)                     FROM anon, authenticated;
