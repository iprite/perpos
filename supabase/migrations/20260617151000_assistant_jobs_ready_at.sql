-- Meeting Bot (Phase 2.5 fix) — ready_at: เวลาที่ recording พร้อมถอด (bot.done → recording_ready)
-- ใช้เป็นฐานนับ "พยายามถอดมานานแค่ไหน" สำหรับ giveup/goodwill ใน scheduler
--   (ใช้ updated_at ไม่ได้ เพราะ triggerSttWorker รีเซ็ตทุก retry → ไม่มีวันถึง giveup)
ALTER TABLE public.assistant_jobs ADD COLUMN IF NOT EXISTS ready_at timestamptz;
