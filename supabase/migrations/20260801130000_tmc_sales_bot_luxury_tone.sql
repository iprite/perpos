-- ผู้ช่วยขาย TMC — ยกระดับน้ำเสียงเป็น "แอดมินมืออาชีพของ luxury pool villa"
-- เปลี่ยนทั้ง default ของคอลัมน์ และอัปเดตแถวที่ยังใช้ข้อความตั้งต้นเดิม (ไม่แตะของที่แอดมินแก้เอง)

ALTER TABLE public.tmc_bot_settings
  ALTER COLUMN bot_name SET DEFAULT 'ผู้ดูแลลูกค้า Thammachat Villa',
  ALTER COLUMN greeting_text SET DEFAULT 'สวัสดีค่ะ ยินดีต้อนรับสู่ Thammachat Villa ค่ะ 🌿
พูลวิลล่าส่วนตัวให้เช่าเหมาหลัง พร้อมอาหารเช้าสำหรับผู้เข้าพักทุกท่าน
สอบถามราคา จำนวนผู้เข้าพัก ห้องนอน หรือการพาสัตว์เลี้ยงมาด้วย พิมพ์เข้ามาได้เลยนะคะ ยินดีดูแลค่ะ',
  ALTER COLUMN fallback_text SET DEFAULT 'ขออภัยด้วยนะคะ เรื่องนี้ขออนุญาตให้ผู้ดูแลของเราตอบให้ละเอียดกว่านี้ค่ะ 🙏
รบกวนรอสักครู่ เดี๋ยวเจ้าหน้าที่เข้ามาดูแลในแชทนี้โดยเร็วที่สุดค่ะ',
  ALTER COLUMN handoff_text SET DEFAULT 'รับทราบค่ะ กำลังเรียนเชิญเจ้าหน้าที่เข้ามาดูแลให้นะคะ 🙏
รบกวนรอสักครู่ เดี๋ยวมีผู้ดูแลเข้ามาคุยกับคุณลูกค้าในแชทนี้ค่ะ';

UPDATE public.tmc_bot_settings SET bot_name = DEFAULT WHERE bot_name = 'น้องแอดมิน TMC';
UPDATE public.tmc_bot_settings SET greeting_text = DEFAULT WHERE greeting_text LIKE 'สวัสดีค่ะ 🙏 ยินดีต้อนรับสู่ TMC Villa%';
UPDATE public.tmc_bot_settings SET fallback_text = DEFAULT WHERE fallback_text LIKE 'ขออภัยค่ะ เรื่องนี้น้องขอส่งต่อ%';
UPDATE public.tmc_bot_settings SET handoff_text = DEFAULT WHERE handoff_text LIKE 'รับทราบค่ะ กำลังเรียกแอดมินให้%';
