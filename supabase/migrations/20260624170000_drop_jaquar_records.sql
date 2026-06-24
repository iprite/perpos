-- Drop dead scaffold table: jaquar_records
-- ตารางนี้เป็น scaffold เริ่มต้นที่ไม่มี frontend caller ใดเรียกใช้
-- ตารางข้อมูลจริงของโมดูล jaquar คือ jaquar_inventory_items + jaquar_inventory_movements
-- API route /api/jaquar/route.ts และฟังก์ชัน canWrite() ใน _lib.ts ถูกลบพร้อมกัน (dead code removal)
DROP TABLE IF EXISTS public.jaquar_records CASCADE;
