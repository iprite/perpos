-- Migration: 20260615120000_assistant_transcription.sql
-- Speech-to-Text (แกะเสียง + แยกผู้พูด) สำหรับโมดูล Assistant
--   1. ตาราง transcription_jobs (async job queue สำหรับ stt-worker)
--   2. RLS ให้สมาชิก org เข้าถึง job ของ org ตน
--   3. Storage bucket `assistant_audio` (private) + policy org-scoped

BEGIN;

-- ── 1. transcription_jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcription_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_url          text NOT NULL,                 -- storage path: <org_id>/<file>
  file_name          text NOT NULL,
  mime_type          text NOT NULL,
  file_size          bigint,
  duration_seconds   numeric,
  model              text NOT NULL DEFAULT 'gemini-2.5-flash'
                       CHECK (model IN ('gemini-2.5-flash', 'gemini-2.5-pro')),
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcript_json    jsonb DEFAULT NULL,            -- { language, speakers, segments:[{speaker,start,end,text}] }
  transcript_text    text DEFAULT NULL,             -- plaintext เผื่อ copy/download
  error_message      text,
  correlation_id     uuid NOT NULL DEFAULT gen_random_uuid(),
  triggered_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  triggered_by_email text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_org_created
  ON public.transcription_jobs (org_id, created_at DESC);

ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;

-- สมาชิกขององค์กรอ่าน job ของ org ตนได้
DROP POLICY IF EXISTS transcription_jobs_select ON public.transcription_jobs;
CREATE POLICY transcription_jobs_select ON public.transcription_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = transcription_jobs.org_id
        AND om.user_id = auth.uid()
    )
  );

-- ไม่มี write policy สำหรับ authenticated โดยตั้งใจ — ทุก INSERT/UPDATE ไปผ่าน
-- admin client (API routes) และ stt-worker (service role) ซึ่ง bypass RLS อยู่แล้ว
-- การไม่เปิด write ตรงให้ผู้ใช้ ลด attack surface (กันการปลอม transcript/สถานะ)
DROP POLICY IF EXISTS transcription_jobs_write ON public.transcription_jobs;

-- ── 2. Storage bucket assistant_audio (private) ────────────────────────────────
-- file_size_limit = 200MB (จุดบังคับใช้ที่แข็งที่สุด — กัน worker OOM และการถม storage)
-- allowed_mime_types = เฉพาะไฟล์เสียง/วิดีโอ (defense-in-depth ร่วมกับ guard ฝั่ง app)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assistant_audio', 'assistant_audio', false,
  209715200,
  ARRAY[
    'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav',
    'audio/aac', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/webm',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- อนุญาตเฉพาะสมาชิกขององค์กร โดยไฟล์ต้องอยู่ใต้โฟลเดอร์ <org_id>/ (กัน cross-tenant)
DROP POLICY IF EXISTS "assistant_audio_member_select" ON storage.objects;
CREATE POLICY "assistant_audio_member_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'assistant_audio'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assistant_audio_member_insert" ON storage.objects;
CREATE POLICY "assistant_audio_member_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assistant_audio'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assistant_audio_member_delete" ON storage.objects;
CREATE POLICY "assistant_audio_member_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assistant_audio'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload config';

COMMIT;
