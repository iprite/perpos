-- ผู้ช่วย AI per-profile: ผู้ใช้เห็นเฉพาะงานของตัวเองเท่านั้น (ตัด clause org-member ออก)
-- กัน B2B org member แอบอ่าน STT ของกันผ่าน REST · ไม่กระทบเว็บ (อ่านผ่าน API service role)
DROP POLICY IF EXISTS transcription_jobs_select ON public.transcription_jobs;
CREATE POLICY transcription_jobs_select ON public.transcription_jobs FOR SELECT
  USING (profile_id = auth.uid());
