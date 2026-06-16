-- แยกฟีเจอร์แกะเสียง (STT/MoM) ออกจาก module `assistant` → module ใหม่ `stt`
--
-- เหตุผล: `assistant` = ผู้ช่วยฟรีระดับ org (task/calendar/finance/news)
--         `stt`       = แกะเสียง→รายงานประชุม ระดับ personal มีการเก็บเงินแยก (subscription)
--
-- กลไกสิทธิ์ STT หลังแยก:
--   personal_module_grants(stt) → ให้ตอน onboarding (พร้อม trial 300 นาที) คงไว้ตลอด
--   ใช้ /mom ได้จริง = มี grant AND (quota เหลือ OR subscription active)
--   ↑ ด่านเก็บเงินจริงคือ quota (บังคับที่ stt-worker / consume_stt_quota) — trial หมดต้อง subscribe
--
-- Backfill: mirror สิทธิ์ assistant → stt แบบ 1:1 เพื่อให้ผู้ใช้เดิมใช้ /mom + เว็บ transcribe ต่อได้ไม่สะดุด

-- ── 1. ลงทะเบียน module `stt` ─────────────────────────────────────────────────
INSERT INTO module_registry (key, label, href_slug, description, is_specific, is_builtin, is_active, is_personal, sort_order)
VALUES ('stt', 'แกะเสียง→รายงานประชุม', 'assistant/transcribe', 'ถอดเสียงประชุมเป็นรายงาน (MoM) — ระดับบุคคล มีแพ็กเกจรายเดือน', false, true, true, true, 7)
ON CONFLICT (key) DO NOTHING;

-- ── 2. permission key สำหรับ /mom (แยกจาก bot.assistant.tasks) ─────────────────
--   ผู้ใช้ที่เคยมี bot.assistant.tasks=allowed → ให้ bot.assistant.transcribe ตามไปด้วย (กันของเดิมพัง)
INSERT INTO user_permissions (user_id, function_key, allowed)
SELECT user_id, 'bot.assistant.transcribe', allowed
  FROM user_permissions
 WHERE function_key = 'bot.assistant.tasks'
ON CONFLICT (user_id, function_key) DO NOTHING;

-- ── 3. Backfill org_module_settings (stt) — mirror จาก assistant ───────────────
INSERT INTO org_module_settings (organization_id, module_key, is_enabled, allowed_roles)
SELECT organization_id, 'stt', is_enabled, allowed_roles
  FROM org_module_settings
 WHERE module_key = 'assistant'
ON CONFLICT (organization_id, module_key) DO NOTHING;

-- ── 4. Backfill personal_module_grants (stt) — mirror จาก assistant ────────────
INSERT INTO personal_module_grants (module_key, user_id, granted_by, is_enabled)
SELECT 'stt', user_id, granted_by, is_enabled
  FROM personal_module_grants
 WHERE module_key = 'assistant'
ON CONFLICT (module_key, user_id) DO NOTHING;

-- ── 5. Backfill module_members (stt) — mirror จาก assistant (กันเว็บ transcribe 403) ─
INSERT INTO module_members (org_id, module_key, user_id, module_role, is_active, invited_by)
SELECT org_id, 'stt', user_id, module_role, is_active, invited_by
  FROM module_members
 WHERE module_key = 'assistant'
ON CONFLICT (org_id, module_key, user_id) DO NOTHING;
