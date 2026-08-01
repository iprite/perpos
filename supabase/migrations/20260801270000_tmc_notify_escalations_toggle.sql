-- ผู้ช่วยขาย TMC — สวิตช์ปิดการแจ้งเตือนเคสเข้ากลุ่ม LINE ของทีมแอดมิน
--
-- ปิดแจ้งเตือน ≠ ปลดผูกกลุ่ม: กลุ่มเดิมยังใช้แท็ก @perpos เพิ่มความรู้/สั่งกฎได้เหมือนเดิม
-- และเคสยังขึ้นในหน้า "เคสรอแอดมิน" ตามปกติ — แค่ไม่ push การ์ดเข้ากลุ่ม
ALTER TABLE public.tmc_bot_settings
  ADD COLUMN IF NOT EXISTS notify_escalations boolean NOT NULL DEFAULT true;
