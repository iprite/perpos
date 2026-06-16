-- Assistant v2 — Phase 1 (DB)
-- ทิศทางใหม่: "ผู้ช่วย AI (assistant)" = บริการ per-profile (umbrella) ตอนนี้ = ถอดเสียง→MoM
--   · ยกเลิก module `assistant` เดิม (Task Manager ใน ERP) ทิ้งทั้งหมด
--   · module เดิม `stt` → relabel เป็น "ผู้ช่วย AI" + path /assistant (key ภายในคง 'stt' เพื่อเลี่ยง FK rename เสี่ยง)
--   · STT เป็น per-profile: transcription_jobs.org_id เป็น optional + RLS เห็นงานตัวเอง

-- 1. ยกเลิก module assistant เดิม (Task Manager) — ลบสิทธิ์ทั้ง 3 ชั้น + registry
DELETE FROM public.org_module_settings   WHERE module_key = 'assistant';
DELETE FROM public.module_members        WHERE module_key = 'assistant';
DELETE FROM public.personal_module_grants WHERE module_key = 'assistant';
DELETE FROM public.module_registry        WHERE key = 'assistant';

-- 2. stt → relabel เป็น "ผู้ช่วย AI" (key ภายในคง 'stt'); path /assistant กำหนดในโค้ด (modules.ts)
UPDATE public.module_registry
   SET label       = 'ผู้ช่วย AI',
       href_slug   = 'assistant',
       is_personal = true,
       description = 'ผู้ช่วย AI ส่วนตัว — ถอดเสียงประชุมเป็นรายงาน (รองรับฟีเจอร์อื่นในอนาคต)',
       updated_at  = now()
 WHERE key = 'stt';

-- 3. transcription_jobs → per-profile (org_id optional)
ALTER TABLE public.transcription_jobs ALTER COLUMN org_id DROP NOT NULL;

-- 4. RLS — เห็นงานของตัวเอง (per-profile) + คงสิทธิ์ org เดิมไว้ (ไม่ทำของเก่าหาย)
DROP POLICY IF EXISTS transcription_jobs_select ON public.transcription_jobs;
CREATE POLICY transcription_jobs_select ON public.transcription_jobs FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
       WHERE om.organization_id = transcription_jobs.org_id AND om.user_id = auth.uid()
    )
  );
