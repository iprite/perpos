-- ผู้ช่วยขาย TMC — ข้อความเดียวจากกลุ่ม LINE บันทึกได้หลายเรื่อง
--
-- เดิม: 1 ข้อความ = 1 ร่าง → แอดมินพิมพ์ยาว ๆ ที่มีทั้ง "ข้อมูล" และ "คำสั่งวิธีพูด"
--       ระบบเก็บได้เรื่องเดียว ที่เหลือหายเงียบ
-- ใหม่: AI แตกเป็นหลายรายการ ผูกกันด้วย batch_id → การ์ดรวม กดยืนยันทีเดียวทั้งชุด
ALTER TABLE public.tmc_kb_drafts
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS tmc_kb_drafts_batch_idx
  ON public.tmc_kb_drafts (batch_id) WHERE batch_id IS NOT NULL;
