-- =========================================================
-- Google Drive storage (D1) — เก็บ MoM PDF (+ ไฟล์เสียง opt-in) ลง Drive ผู้ใช้
--   reuse การเชื่อม Google เดิม (scope drive.file) · โฟลเดอร์ "Perpos Assistant" + subfolder ตามหมวด
-- =========================================================

-- toggle ต่อ profile (อยู่ใน google settings row เดียวกับ calendar)
ALTER TABLE public.meeting_calendar_settings
  ADD COLUMN IF NOT EXISTS save_mom_to_drive   boolean NOT NULL DEFAULT true,   -- MoM: auto-on ตอนเชื่อม
  ADD COLUMN IF NOT EXISTS save_audio_to_drive boolean NOT NULL DEFAULT false;  -- เสียง: opt-in (PDPA)

-- ลิงก์ไฟล์ MoM บน Drive (webViewLink) — โชว์ปุ่ม "เปิดใน Drive" + หน้า usage
ALTER TABLE public.assistant_jobs
  ADD COLUMN IF NOT EXISTS mom_drive_url text;

-- cache id ของ subfolder ตามหมวด (category key → folderId) เผื่อฟีเจอร์อื่นในอนาคต
-- root "Perpos Assistant" ยังใช้ google_drive_tokens.drive_root_folder_id เดิม
ALTER TABLE public.google_drive_tokens
  ADD COLUMN IF NOT EXISTS drive_subfolders jsonb NOT NULL DEFAULT '{}'::jsonb;
