-- ปิดช่องที่ product-audit ของระบบคลังจับได้ (พิสูจน์จาก ACL จริงบน prod) — apply prod แล้ว 2026-07-31
--
-- (1) view ฝั่งขายทั้ง 5 ตัวเป็น single-table view ⇒ auto-updatable และ owner = postgres (bypassrls)
--     Supabase ให้สิทธิ์ default แก่ `authenticated` ครบทุกคำสั่งตั้งแต่ตอน CREATE VIEW
--     ⇒ ยิง INSERT/UPDATE/DELETE ผ่าน view เขียนทะลุถึงตารางจริงได้ "โดย RLS ไม่ทำงานเลย"
--     (ผู้รับเหมาช่วงปั่นต้นทุนเฉลี่ยได้ถาวร และไม่มี WITH CHECK OPTION จึงยัดข้าม org ได้ด้วย)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON just_me_stock_movements_basic, just_me_boq_items_sell, just_me_pr_items_basic,
     just_me_projects_basic, just_me_boqs_basic
  FROM authenticated, anon;

-- (2) ยอดคงเหลือและทะเบียน serial ยังเป็น policy `FOR ALL … is_org_member` (ของเดิม)
--     ⇒ viewer แก้ยอดคงเหลือ/ปลดสถานะ serial ตรง ๆ ได้ โดยไม่มี movement ทิ้งร่องรอย
--     รัดให้เท่ากับ movement: อ่านได้ทุกสมาชิก แต่เขียนได้เฉพาะผู้ที่เห็นต้นทุน
DROP POLICY IF EXISTS "just_me_stock_balances_write"  ON just_me_stock_balances;
DROP POLICY IF EXISTS "just_me_stock_balances_insert" ON just_me_stock_balances;
DROP POLICY IF EXISTS "just_me_stock_balances_update" ON just_me_stock_balances;
DROP POLICY IF EXISTS "just_me_stock_balances_delete" ON just_me_stock_balances;
CREATE POLICY "just_me_stock_balances_insert" ON just_me_stock_balances
  FOR INSERT WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_stock_balances_update" ON just_me_stock_balances
  FOR UPDATE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id))
  WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_stock_balances_delete" ON just_me_stock_balances
  FOR DELETE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

DROP POLICY IF EXISTS "just_me_item_serials_write"  ON just_me_item_serials;
DROP POLICY IF EXISTS "just_me_item_serials_insert" ON just_me_item_serials;
DROP POLICY IF EXISTS "just_me_item_serials_update" ON just_me_item_serials;
DROP POLICY IF EXISTS "just_me_item_serials_delete" ON just_me_item_serials;
CREATE POLICY "just_me_item_serials_insert" ON just_me_item_serials
  FOR INSERT WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_item_serials_update" ON just_me_item_serials
  FOR UPDATE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id))
  WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_item_serials_delete" ON just_me_item_serials
  FOR DELETE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

-- (3) anon ไม่ควรมีสิทธิ์อะไรกับตารางคลังเลย (ติดมาจาก default privileges)
REVOKE ALL ON just_me_stock_balances, just_me_item_serials FROM anon;

COMMENT ON VIEW just_me_stock_movements_basic IS
  'ทางอ่านของ viewer/ผู้รับเหมาช่วง (ไม่มีคอลัมน์ต้นทุน) — READ-ONLY: ถูก REVOKE สิทธิ์เขียนแล้ว เพราะ view เป็นของ postgres จึง bypass RLS ถ้าปล่อยให้เขียนได้ · ห้ามเพิ่มคอลัมน์ต้นทุนเข้าไปเด็ดขาด';
