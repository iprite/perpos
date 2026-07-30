-- tmc_stays: 1 booking ต้องระบุห้อง + ช่วงวันเข้าพักเสมอ (ฐานของ คืนต่อห้อง / revenue ต่อห้อง)
-- ข้อมูลเดิมไม่มี null แล้ว (ตรวจ 2026-07-30) — ยกเว้น 1 แถว check_out < check_in (typo เดือน)
-- จึงใช้ CHECK แบบ NOT VALID: บังคับเฉพาะแถวใหม่/แถวที่ถูกแก้
ALTER TABLE tmc_stays ALTER COLUMN property_code SET NOT NULL;
ALTER TABLE tmc_stays ALTER COLUMN check_out SET NOT NULL;
ALTER TABLE tmc_stays
  ADD CONSTRAINT tmc_stays_checkout_after_checkin CHECK (check_out > check_in) NOT VALID;
