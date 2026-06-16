-- Backfill module_members(assistant) สำหรับผู้ใช้ที่ auto-onboard ผ่าน LINE ไปแล้ว
--
-- บั๊ก: provisionLineUser เดิมใส่แค่ org_module_settings + personal_module_grants
-- แต่ route เว็บ /api/assistant/transcribe/* ใช้ requireModuleMember ซึ่งเช็ค module_members
-- → ผู้ใช้ LINE ที่เคลมบัญชีแล้วเข้าเว็บ transcribe โดน 403 ทั้งหมด
--
-- ตั้งแต่ migration นี้ provisioning ใส่ module_members แล้ว; ตัวนี้เก็บตกของเก่า
-- เกณฑ์: ใครที่มี personal_module_grants(assistant, enabled) + เป็นสมาชิก org ที่เปิด
-- org_module_settings(assistant, enabled) → seed module_members(assistant) ตาม org role

INSERT INTO public.module_members (org_id, module_key, user_id, module_role, is_active, invited_by)
SELECT
  om.organization_id,
  'assistant',
  om.user_id,
  om.role,          -- org role → assistant module role (owner/admin/member)
  true,
  om.user_id
FROM public.organization_members om
JOIN public.org_module_settings oms
  ON oms.organization_id = om.organization_id
  AND oms.module_key = 'assistant'
  AND oms.is_enabled = true
JOIN public.personal_module_grants pmg
  ON pmg.user_id = om.user_id
  AND pmg.module_key = 'assistant'
  AND pmg.is_enabled = true
ON CONFLICT (org_id, module_key, user_id) DO NOTHING;
