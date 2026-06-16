-- บันทึก token จริงจาก Gemini usageMetadata ลง transcription_jobs
--   → คิดต้นทุนแบบเป๊ะ (แทนการประมาณจาก duration) + เห็น thinking token จริง
-- เก็บ "ข้อเท็จจริง" (จำนวน token) ไม่เก็บราคา/cost — คิด cost ตอนอ่านด้วยราคาปัจจุบัน (env)
-- จึงสะท้อนราคาที่เปลี่ยนได้ย้อนหลังโดยไม่ต้อง backfill

ALTER TABLE public.transcription_jobs
  ADD COLUMN IF NOT EXISTS prompt_tokens       int,   -- input ทั้งหมด (เสียง + ข้อความ prompt)
  ADD COLUMN IF NOT EXISTS audio_input_tokens  int,   -- เฉพาะ token เสียง (modality=AUDIO)
  ADD COLUMN IF NOT EXISTS output_tokens       int,   -- candidates + thoughts (คิดที่ราคา output)
  ADD COLUMN IF NOT EXISTS thoughts_tokens     int,   -- thinking token (subset ของ output — ไว้ดูเฉย ๆ)
  ADD COLUMN IF NOT EXISTS usage_metadata      jsonb; -- usageMetadata ดิบจาก Gemini (เผื่อ audit/ดูละเอียด)

COMMENT ON COLUMN public.transcription_jobs.prompt_tokens IS 'Gemini usageMetadata.promptTokenCount (input รวมเสียง+ข้อความ)';
COMMENT ON COLUMN public.transcription_jobs.audio_input_tokens IS 'token เสียง (promptTokensDetails modality=AUDIO) — null ถ้า Gemini ไม่แยก modality';
COMMENT ON COLUMN public.transcription_jobs.output_tokens IS 'candidatesTokenCount + thoughtsTokenCount (คิดที่ราคา output)';
COMMENT ON COLUMN public.transcription_jobs.thoughts_tokens IS 'thinking/thoughtsTokenCount (subset ของ output_tokens)';
