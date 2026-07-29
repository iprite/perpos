-- BUGFIX (พบระหว่างเทส tenant isolation ของ vault — apply prod แล้ว 2026-07-29)
--
-- public.current_role() / is_admin() เป็น SECURITY INVOKER และไม่ปิด row_security:
--   profiles policy = "id = auth.uid() OR is_admin()"
--     → is_admin() → current_role() → SELECT role FROM profiles
--       → policy เดิมอีกรอบ → is_admin() → … วนไม่จบ
--   ผลลัพธ์: ERROR 54001 stack depth limit exceeded ทั้ง statement
--
-- อาการจริง: query ใด ๆ ที่รันด้วย anon key (role authenticated) แล้วต้องประเมิน is_admin()
-- บนแถวที่ไม่ใช่ของตัวเอง จะพัง — ที่ผ่านมาไม่ค่อยเจอเพราะแอปอ่านผ่าน service-role เป็นหลัก
-- และเจอตอนเทส RLS ของ vault (SELECT บน acc_firm_service_clients ที่มี policy super_admin)
--
-- แก้ให้ตรงกับ schema พี่น้องที่ทำถูกอยู่แล้ว (exapp.current_role / riekchang.current_role):
-- SECURITY DEFINER + row_security = off → อ่าน profiles โดยไม่ปลุก policy ซ้ำ
-- semantics ไม่เปลี่ยน (ยังคืน role ของ auth.uid() เหมือนเดิม)

CREATE OR REPLACE FUNCTION public."current_role"()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $fn$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$fn$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $fn$
  SELECT public.current_role() = 'admin';
$fn$;
