-- Migration: 20260617091000_drop_transcription_jobs_compat_view.sql
--
-- ดรอป compat view `transcription_jobs` หลัง rollout 2e ครบ (app + stt-worker ใช้
-- assistant_jobs หมดแล้ว) — apply หลังยืนยัน deploy ทั้งสองฝั่งเรียบร้อย
--
-- ⚠️ อย่า apply พร้อมไฟล์ 20260617090000 — ต้องรอ deploy worker + app ก่อน

DROP VIEW IF EXISTS public.transcription_jobs;
