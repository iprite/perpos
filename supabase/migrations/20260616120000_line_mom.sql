-- LINE Bot MoM: รับไฟล์เสียงผ่าน LINE (/mom) แล้วส่ง PDF รายงานการประชุมกลับ
--   1. transcription_jobs.source — แยกงานที่มาจาก LINE (เพื่อส่งผลกลับทาง LINE)
--   2. assistant_line_sessions — state "รอไฟล์เสียงหลังพิมพ์ /mom" (per LINE user)
--   3. assistant_audio bucket — อนุญาต application/pdf (เก็บ PDF ผลลัพธ์ + signed URL)

-- 1. source column
ALTER TABLE public.transcription_jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'line'));

-- 2. assistant_line_sessions (mirror crm_line_sessions) — admin client เท่านั้นที่เข้าถึง
CREATE TABLE IF NOT EXISTS public.assistant_line_sessions (
  line_user_id text PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action       text NOT NULL DEFAULT 'mom',
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_line_sessions ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy → authenticated เข้าไม่ได้; webhook ใช้ service role (bypass RLS)

-- 3. อนุญาต PDF ใน bucket assistant_audio (เก็บผลลัพธ์ MoM)
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
WHERE id = 'assistant_audio'
  AND NOT ('application/pdf' = ANY(allowed_mime_types));
