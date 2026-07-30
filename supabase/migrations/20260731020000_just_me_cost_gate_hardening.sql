-- ปิดช่องที่ security/integration review จับได้ (just-me-project-loop) — apply prod แล้ว 2026-07-31
-- 1) just_me_settings เก็บ %กำไรตั้งต้น/เกณฑ์เตือน = ข้อมูลต้นทุน แต่ SELECT เดิมเป็น member เฉย ๆ
--    ⇒ viewer (ผู้รับเหมาช่วง) ยิง PostgREST ตรงเห็น default_margin_pct แล้วถอดต้นทุนจากราคาขายได้
DROP POLICY IF EXISTS just_me_settings_select ON just_me_settings;
CREATE POLICY just_me_settings_select ON just_me_settings
  FOR SELECT USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

-- 2) เขียน just_me_stock_movements ได้ = ปั่นต้นทุนเฉลี่ยของทั้ง org ได้ถาวร (trigger สะสมทางเดียว กู้ไม่ได้)
--    เดิมเป็น is_org_member ⇒ viewer เขียนได้ · รัดให้เท่ากับ "ผู้ที่เห็นต้นทุน" (owner/manager)
DROP POLICY IF EXISTS just_me_stock_movements_insert ON just_me_stock_movements;
CREATE POLICY just_me_stock_movements_insert ON just_me_stock_movements
  FOR INSERT WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

DROP POLICY IF EXISTS just_me_stock_movements_update ON just_me_stock_movements;
CREATE POLICY just_me_stock_movements_update ON just_me_stock_movements
  FOR UPDATE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id))
  WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

DROP POLICY IF EXISTS just_me_stock_movements_delete ON just_me_stock_movements;
CREATE POLICY just_me_stock_movements_delete ON just_me_stock_movements
  FOR DELETE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

-- 3) ล็อกยอดงวดที่วางบิลแล้ว: เดิมดูแค่ OLD.status ⇒ เปลี่ยนสถานะกลับเป็น planned ก่อน แล้วค่อยแก้ยอดได้
--    ผูกกับ "มีเอกสารภาษีออกไปแล้ว" แทน เพราะเอกสารที่ออกไปหาลูกค้าย้อนไม่ได้
CREATE OR REPLACE FUNCTION just_me_billing_amount_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.status IN ('invoiced', 'paid') OR OLD.invoice_document_id IS NOT NULL)
     AND (NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.retention_amount IS DISTINCT FROM OLD.retention_amount) THEN
    RAISE EXCEPTION 'งวดนี้ออกใบแจ้งหนี้/ใบกำกับไปแล้ว แก้ยอดไม่ได้ — ต้องออกใบลดหนี้/เพิ่มหนี้ที่ระบบบัญชีแทน'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON POLICY just_me_settings_select ON just_me_settings IS
  'ค่าตั้งต้น %กำไร/เกณฑ์เตือน = ข้อมูลต้นทุน — เฉพาะ owner/manager (viewer ต้องไม่เห็น margin ของบริษัท)';
COMMENT ON POLICY just_me_stock_movements_insert ON just_me_stock_movements IS
  'เขียนความเคลื่อนไหวคลัง = กระทบต้นทุนเฉลี่ยถาวร (trigger สะสมทางเดียว) — จำกัดเท่ากับผู้ที่เห็นต้นทุน';
