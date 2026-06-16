-- Migration: 20260617090000_rename_transcription_jobs_to_assistant_jobs.sql
--
-- Phase 2e: rename job hub ให้เป็น generic ใต้ร่ม assistant
--   transcription_jobs → assistant_jobs (hub ที่ผู้ช่วยทุก kind reuse ได้ — ดู kind column 2c)
--
-- ปลอดภัย: ไม่มี function/trigger อ้างชื่อตารางใน body (ตรวจแล้ว) · FK ขาเข้า/index/policy
-- auto-follow ตอน RENAME · rename ให้ครบเพื่อความสะอาด (ชื่อ index/policy/pkey)
--
-- compat view: คงชื่อ `transcription_jobs` เป็น view ชั่วคราว (security_invoker → RLS ฐาน
-- ยังบังคับ) เพื่อให้โค้ดเก่าที่ deploy อยู่ไม่พังระหว่าง rollout worker/app
-- → ดรอปทิ้งใน migration ถัดไปหลัง deploy ครบ (20260617091000_*)

ALTER TABLE public.transcription_jobs RENAME TO assistant_jobs;

ALTER INDEX public.transcription_jobs_pkey                      RENAME TO assistant_jobs_pkey;
ALTER INDEX public.idx_transcription_jobs_org_created           RENAME TO idx_assistant_jobs_org_created;
ALTER INDEX public.idx_transcription_jobs_profile_kind_created  RENAME TO idx_assistant_jobs_profile_kind_created;
ALTER INDEX public.uq_transcription_jobs_line_msg              RENAME TO uq_assistant_jobs_line_msg;
ALTER POLICY transcription_jobs_select ON public.assistant_jobs RENAME TO assistant_jobs_select;

-- compat shim (ชั่วคราว) — service-role อ่าน/เขียนผ่านได้, authenticated ติด RLS ฐานตามเดิม
CREATE VIEW public.transcription_jobs WITH (security_invoker = true) AS
  SELECT * FROM public.assistant_jobs;
