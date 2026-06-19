-- =========================================================
-- Meeting Bot — meeting_key (normalized URL) สำหรับ dedup/reconcile ข้ามกลไก (M2)
--   meeting_url = เต็ม (ส่งบอท · Zoom ต้องมี ?pwd) · meeting_key = normalize (ตัด query/slash) เทียบห้องเดียวกัน
--   Zoom/Teams ลิงก์จาก LINE (มี query) vs Google Calendar (สะอาด) จะ match กันได้ด้วย key
-- =========================================================
ALTER TABLE public.recall_calendar_events
  ADD COLUMN IF NOT EXISTS meeting_key text;

-- index ช่วย reconcile/dedup: หา event ห้องเดียวกันของ profile ในหน้าต่างเวลา
CREATE INDEX IF NOT EXISTS idx_recall_cal_key
  ON public.recall_calendar_events (profile_id, meeting_key, starts_at)
  WHERE is_deleted = false;
