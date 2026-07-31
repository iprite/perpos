-- ปิดช่องเขียนคลังตรงผ่าน PostgREST — RPC ต้องเป็นทางเดียวจริง
--
-- พิสูจน์บน prod (สวมสิทธิ์ owner จริงของ org justme, rollback แล้ว):
--   `INSERT INTO just_me_stock_movements … receive 1000@999` **สำเร็จ**
--   → trigger ต้นทุนดัน `just_me_item_costs` เป็น qty 1070 / value 1,002,150 / avg 936.59
--   → แต่ `just_me_stock_balances` ไม่ขยับ (ยัง 70) เพราะยอดคงเหลือถูกอัปเดตใน RPC ไม่ใช่ trigger
--   ⇒ invariant `qty_on_hand = Σ balances` แตกถาวร และแถวนั้นลบไม่ได้ (trigger immutable)
--
-- 20260731090000 ปิดให้ view + stock_balances ไปแล้ว แต่ตกตัวตาราง movements เอง
-- ทุก write path ของโมดูลใช้ service-role ผ่าน API (ตรวจครบทั้ง repo — ไม่มีที่ไหนเขียนผ่าน RLS client)
-- SELECT ยังคงเดิม: RLS + `just_me_has_cost_access` เป็นด่าน
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON just_me_stock_movements FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON just_me_stock_movement_serials FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON just_me_stock_balances FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON just_me_item_costs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON just_me_item_serials FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON just_me_stock_counts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON just_me_stock_count_items FROM anon, authenticated;

-- view สรุปต้นทุนรายเดือน — เผลอ GRANT ALL ไว้ (ยัง insert ไม่ได้จริงเพราะเป็น view รวมกลุ่ม แต่ไม่ควรมีสิทธิ์ค้าง)
REVOKE ALL ON just_me_item_cost_monthly FROM anon, authenticated;
GRANT SELECT ON just_me_item_cost_monthly TO authenticated;
