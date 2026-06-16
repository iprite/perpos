-- ถอด module `assistant` ออกจาก personal org ทั้งหมด (โมเดล: personal org = B2C STT เท่านั้น)
--
-- เหตุผล: `assistant` ถูกจัดเป็น B2B module (superadmin เปิดให้ต่อ org เท่านั้น)
--   แต่ provisioning เก่า + backfill แจก assistant ติดมากับ personal org ของผู้ใช้ LINE
--   → ต้องลบออก ให้ personal org เหลือแค่ `stt`
--
-- personal org = org ที่ auto-provision (name ขึ้นต้น 'พื้นที่ส่วนตัว' หรือ slug รูปแบบ u<10 อักขระ>)
-- ปลอดภัย: ตรวจแล้ว assistant grant ทุกตัวมาจาก personal org ล้วน — ไม่มีใครมี B2B assistant ทับซ้อน
-- (เงื่อนไข personal_module_grants ลบเฉพาะ user ที่ไม่ได้เป็น assistant member ของ org ที่ "ไม่ใช่" personal)

WITH personal_orgs AS (
  SELECT id FROM public.organizations
   WHERE name LIKE 'พื้นที่ส่วนตัว%' OR slug ~ '^u[a-z0-9]{10}$'
)
-- 1) ปิด assistant ระดับ org สำหรับ personal org
DELETE FROM public.org_module_settings
 WHERE module_key = 'assistant'
   AND organization_id IN (SELECT id FROM personal_orgs);

WITH personal_orgs AS (
  SELECT id FROM public.organizations
   WHERE name LIKE 'พื้นที่ส่วนตัว%' OR slug ~ '^u[a-z0-9]{10}$'
)
-- 2) ลบ assistant module_members ใน personal org
DELETE FROM public.module_members
 WHERE module_key = 'assistant'
   AND org_id IN (SELECT id FROM personal_orgs);

-- 3) ลบ personal_module_grants(assistant) เฉพาะ user ที่ไม่มี assistant membership ใน org ที่ไม่ใช่ personal
--    (กันลบโดน B2B user ที่ได้ assistant จากองค์กรจริง)
DELETE FROM public.personal_module_grants g
 WHERE g.module_key = 'assistant'
   AND NOT EXISTS (
     SELECT 1 FROM public.module_members m
       JOIN public.organizations o ON o.id = m.org_id
      WHERE m.user_id = g.user_id
        AND m.module_key = 'assistant'
        AND m.is_active = true
        AND o.name NOT LIKE 'พื้นที่ส่วนตัว%'
        AND o.slug !~ '^u[a-z0-9]{10}$'
   );
