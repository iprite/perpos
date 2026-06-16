-- Assistant v2 — Phase 4 cleanup
-- ผู้ช่วย AI (key ภายใน 'stt') เป็น per-profile แล้ว → org_module_settings/module_members(stt)
-- เป็น vestigial (สิทธิ์เช็คผ่าน personal_module_grants เท่านั้น) · ลบออกได้ ไม่กระทบการทำงาน

DELETE FROM public.org_module_settings WHERE module_key = 'stt';
DELETE FROM public.module_members      WHERE module_key = 'stt';
