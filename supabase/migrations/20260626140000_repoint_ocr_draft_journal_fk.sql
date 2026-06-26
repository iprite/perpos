-- BUG-2: re-point ocr_processing_jobs.draft_journal_id FK
-- จาก journal_entries (ตารางบัญชีเก่า) → acc_journal_entries (accounting รื้อใหม่)
--
-- เหตุ: OCR remap ให้เขียน draft journal ลง acc_journal_entries แล้ว (worker + approve route)
-- แต่ FK เดิมยังบังคับ draft_journal_id ชี้ journal_entries(id) → เขียน id ของ acc_journal_entries
-- ลงไป = FK violation → OCR job fail ทุกครั้ง (orphan ที่ลึกกว่าเดิม).
-- ปลอดภัย: draft_journal_id ปัจจุบัน NULL ทั้งหมด (acc_firm_clients=0, ยังไม่มี OCR job จริง).

alter table public.ocr_processing_jobs
  drop constraint if exists ocr_processing_jobs_draft_journal_id_fkey;

alter table public.ocr_processing_jobs
  add constraint ocr_processing_jobs_draft_journal_id_fkey
  foreign key (draft_journal_id)
  references public.acc_journal_entries(id)
  on delete set null;
