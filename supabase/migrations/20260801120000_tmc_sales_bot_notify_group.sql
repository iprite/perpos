-- ผู้ช่วยขาย TMC — เปลี่ยนช่องทางแจ้งเตือนแอดมิน
--
-- เดิม: เลือกแอดมินรายคน (notify_profile_ids) → push เข้า LINE ส่วนตัวผ่านบอท PERPOS
-- ใหม่: ผูก "กลุ่ม LINE ของทีมแอดมิน" ด้วยรหัส TMC-XXXXXX → push เข้ากลุ่มผ่าน @tmcvilla เอง
--       (บอทตัวเดียวจบ ไม่ต้องให้แอดมินแต่ละคนผูกบัญชีกับ PERPOS ก่อน)
--
-- กติกาเดียวกับกลุ่มลูกค้าของ acc_firm: กลุ่มที่ยังไม่ผูก บอทเงียบเสมอ · รหัสใช้ครั้งเดียว หมดอายุ 24 ชม.
ALTER TABLE public.tmc_bot_settings
  DROP COLUMN IF EXISTS notify_profile_ids,
  ADD COLUMN IF NOT EXISTS notify_group_id        text,
  ADD COLUMN IF NOT EXISTS notify_group_name      text,
  ADD COLUMN IF NOT EXISTS notify_linked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS link_code              text,
  ADD COLUMN IF NOT EXISTS link_code_expires_at   timestamptz;

COMMENT ON COLUMN public.tmc_bot_settings.link_code IS
  'รหัสผูกกลุ่ม TMC-XXXXXX ใช้ครั้งเดียว หมดอายุ 24 ชม. — ล้างทันทีที่ผูกสำเร็จ';
