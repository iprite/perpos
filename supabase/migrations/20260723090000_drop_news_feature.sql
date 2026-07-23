-- ถอดฟีเจอร์ข่าว (News Agent / delivery) ออกทั้งก้อน
--
-- บริบท: ฟีเจอร์นี้ตายไปแล้ว — ไม่มี UI, ไม่มี cron, ไม่มี importer เรียก และโค้ดฝั่งแอป
-- ถูกลบออกแล้ว (lib/news/news-agent.ts, api/admin/news-agent/*, api/admin/delivery/*,
-- prompt news-agent.v1.txt, คำสั่ง LINE `/ข่าว`) เนื่องจากเป็นทางเดียวที่เหลือซึ่งเรียก
-- OpenAI — ตัดออกเพื่อให้คำรับรองต่อ Google API verification ว่า "Gemini เป็น AI provider
-- รายเดียว" เป็นจริงโดยไม่มีช่องโหว่
--
-- ยืนยันก่อนลบ (2026-07-23): ทั้ง 3 ตารางมี 0 แถว และไม่มีแถวใน user_permissions
-- ที่ function_key ขึ้นต้นด้วย 'bot.news' → ไม่มีข้อมูลสูญหาย
--
-- ย้อนกลับ: ถ้าจะรื้อฟีเจอร์ข่าวขึ้นใหม่ ให้สร้างตารางใหม่จาก schema เดิมใน git history
-- (migration ที่สร้างตารางเหล่านี้ยังอยู่ในรีโป)

BEGIN;

DROP TABLE IF EXISTS public.delivery_logs;
DROP TABLE IF EXISTS public.delivery_schedules;
DROP TABLE IF EXISTS public.news_agent_configs;

-- เก็บกวาดสิทธิ์ที่ไม่มีคำสั่งรองรับแล้ว (ปัจจุบัน 0 แถว — กันกรณีมีคนเพิ่มภายหลัง)
DELETE FROM public.user_permissions WHERE function_key LIKE 'bot.news%';

COMMIT;
