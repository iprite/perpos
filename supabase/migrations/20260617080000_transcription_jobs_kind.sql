-- Migration: 20260617080000_transcription_jobs_kind.sql
--
-- เสาเข็ม future-proof: ติด `kind` ให้ตาราง job hub เพื่อให้ผู้ช่วยตัวอื่นใต้ร่ม
-- assistant reuse ตารางเดียวกันได้ในอนาคต (per-kind — ดู lib/assistant/kinds.ts)
--   kind = 'stt' (ปัจจุบันมีตัวเดียว) → คอลัมน์ STT-เฉพาะ (transcript_*, duration_seconds)
--   ปล่อย nullable อยู่แล้ว ผู้ช่วย kind อื่นจะไม่ใช้
--
-- ยังไม่ rename ตารางเป็น assistant_jobs ในไฟล์นี้ (ทำใน phase 2e พร้อม redeploy worker)

ALTER TABLE public.transcription_jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stt';

COMMENT ON COLUMN public.transcription_jobs.kind IS
  'ผู้ช่วยตัวไหนใต้ร่ม assistant (ดู ASSISTANT_KINDS) — ตอนนี้มีแต่ stt';

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_profile_kind_created
  ON public.transcription_jobs (profile_id, kind, created_at DESC);
