-- LINE MoM (async hardening): ย้ายการดาวน์โหลดไฟล์เสียงจาก webhook → stt-worker
-- เพื่อกัน Vercel timeout/LINE retry กับไฟล์ใหญ่ + dedupe webhook redelivery
--   1. line_message_id — webhook เก็บ id ไว้ ให้ worker โหลดเองทีหลัง
--   2. audio_url เป็น nullable — งาน LINE ยังไม่มี path ตอน insert (worker เซ็ตหลังโหลด)
--   3. unique index บน line_message_id — กันสร้าง job ซ้ำเมื่อ LINE ส่ง event เดิมซ้ำ

ALTER TABLE public.transcription_jobs ADD COLUMN IF NOT EXISTS line_message_id text;
ALTER TABLE public.transcription_jobs ALTER COLUMN audio_url DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transcription_jobs_line_msg
  ON public.transcription_jobs (line_message_id)
  WHERE line_message_id IS NOT NULL;
