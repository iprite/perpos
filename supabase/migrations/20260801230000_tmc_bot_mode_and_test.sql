-- ผู้ช่วยขาย TMC — โหมดบอท (ขาย/บริการ) + โหมดทดสอบจำกัดคนที่บอทตอบ
--
-- bot_mode : sales   = ผู้ช่วยขาย (ก่อนจอง — ราคา ห้องว่าง รูป)
--            service = ผู้ช่วยดูแลลูกค้าระหว่าง/หลังเข้าพัก (แจ้งปัญหา ขอความช่วยเหลือ)
--            คนละบุคลิก คนละเกณฑ์การส่งต่อ — เรื่องซ่อมบำรุงต้องถึงคนเร็วที่สุด
--
-- test_mode: เปิดตอนกำลังลองระบบ — บอทตอบเฉพาะ line_user_id ที่ระบุ
--            คนอื่น **บอทเงียบแต่เปิดเคสให้แอดมิน** ไม่ปล่อยลูกค้าจริงค้าง
--
-- human_mode_minutes default 120 → 15 (บอทเด้งกลับเร็วขึ้นตามที่ทีมขอ)
ALTER TABLE public.tmc_bot_settings
  ADD COLUMN IF NOT EXISTS bot_mode text NOT NULL DEFAULT 'sales'
    CHECK (bot_mode IN ('sales', 'service')),
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_line_user_ids text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.tmc_bot_settings ALTER COLUMN human_mode_minutes SET DEFAULT 15;

COMMENT ON COLUMN public.tmc_bot_settings.bot_mode IS
  'sales = ผู้ช่วยขาย (ก่อนจอง) · service = ผู้ช่วยดูแลลูกค้าระหว่าง/หลังเข้าพัก';
COMMENT ON COLUMN public.tmc_bot_settings.test_mode IS
  'เปิด = บอทตอบเฉพาะ line_user_id ใน test_line_user_ids · คนอื่นบอทเงียบและเปิดเคสให้แอดมิน';
