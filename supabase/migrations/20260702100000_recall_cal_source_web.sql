-- =========================================================
-- Meeting Bot — อนุญาต source='web' ใน recall_calendar_events
--   เดิม: 'line' (วางลิงก์ใน LINE) | 'google' (sync จากปฏิทิน)
--   เพิ่ม: 'web'  (วางลิงก์+เวลาในหน้าเว็บ /assistant/meetings → ลงนัด+เตือนเหมือน LINE)
--   remind logic (scheduler step 11) treat non-'google' เหมือนกัน (เตือนเสมอ) → 'web' ทำงานได้ทันที
-- =========================================================

ALTER TABLE public.recall_calendar_events
  DROP CONSTRAINT IF EXISTS recall_calendar_events_source_check;

ALTER TABLE public.recall_calendar_events
  ADD CONSTRAINT recall_calendar_events_source_check
  CHECK (source IN ('line', 'google', 'web'));
