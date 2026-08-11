-- =========================================================
-- ลิงก์ดาวน์โหลดสั้น: รองรับ kind 'pdf' (ไฟล์ที่บีบแล้วจาก pdf-compress-worker)
--   เหตุ: ปุ่มใน LINE Flex มีเพดาน uri 1,000 ตัวอักษร — signed URL + ?download=<ชื่อไฟล์ไทย>
--   (ไทย 1 ตัว = 9 ตัวอักษรหลัง percent-encode) ยาวเกิน → LINE ปฏิเสธทั้ง push
--   ทำให้งานที่บีบสำเร็จแล้วถูกรายงานว่า "บีบไม่สำเร็จ"
-- =========================================================
ALTER TABLE public.file_links DROP CONSTRAINT IF EXISTS file_links_kind_check;
ALTER TABLE public.file_links
  ADD CONSTRAINT file_links_kind_check CHECK (kind IN ('mom', 'audio', 'pdf'));
