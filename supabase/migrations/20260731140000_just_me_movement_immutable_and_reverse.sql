-- ข้อ 2 ของรีวิวคลัง: รายการเคลื่อนไหวเป็น ledger — แก้/ลบย้อนหลังไม่ได้ ต้อง "กลับรายการ" เท่านั้น
-- apply prod แล้ว 2026-07-31
--
-- เหตุผล: trigger คิดต้นทุนเฉลี่ยผูกกับ INSERT อย่างเดียว (สะสมทางเดียว)
--         ⇒ ลบ/แก้รายการ 1 ใบ = ยอดคงเหลือกับต้นทุนเฉลี่ยเพี้ยนเงียบ ๆ กู้ไม่ได้
CREATE OR REPLACE FUNCTION just_me_movement_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ลบรายการเคลื่อนไหวคลังไม่ได้ — ให้ใช้ "กลับรายการ" เพื่อออกรายการตรงข้ามแทน (ต้นทุนเฉลี่ยย้อนกลับเองไม่ได้)'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.movement_type IS DISTINCT FROM OLD.movement_type
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost
     OR NEW.total_cost IS DISTINCT FROM OLD.total_cost
     OR NEW.source_warehouse_id IS DISTINCT FROM OLD.source_warehouse_id
     OR NEW.destination_warehouse_id IS DISTINCT FROM OLD.destination_warehouse_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'แก้จำนวน/ต้นทุน/คลัง/ชนิดของรายการที่บันทึกแล้วไม่ได้ — ให้ "กลับรายการ" แล้วบันทึกใหม่'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_movement_immutable ON just_me_stock_movements;
CREATE TRIGGER trg_just_me_movement_immutable
  BEFORE UPDATE OR DELETE ON just_me_stock_movements
  FOR EACH ROW EXECUTE FUNCTION just_me_movement_immutable();

ALTER TABLE just_me_stock_movements
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid REFERENCES just_me_stock_movements(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS just_me_stock_movements_reversal_once_idx
  ON just_me_stock_movements(reversal_of_id) WHERE reversal_of_id IS NOT NULL;

-- กลับรายการ = ออกรายการตรงข้ามที่อ้างต้นฉบับ · ส่ง unit_cost ของต้นฉบับเสมอ
-- ⇒ ถอนมูลค่าเท่าที่ใส่เข้าไปจริง (ไม่ใช่ตีด้วย avg ปัจจุบัน ซึ่งจะเหลือเศษค้างถาวร)
CREATE OR REPLACE FUNCTION just_me_reverse_movement(
  p_org uuid, p_movement uuid, p_reason text, p_created_by uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; v_type text; v_id uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ต้องระบุเหตุผลที่กลับรายการ' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM just_me_stock_movements WHERE id = p_movement AND org_id = p_org;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการที่ต้องการกลับรายการ' USING ERRCODE = '22023';
  END IF;
  IF m.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'รายการนี้เป็นรายการกลับรายการอยู่แล้ว' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM just_me_stock_movements WHERE reversal_of_id = p_movement) THEN
    RAISE EXCEPTION 'รายการนี้ถูกกลับรายการไปแล้ว' USING ERRCODE = '22023';
  END IF;

  v_type := CASE m.movement_type
              WHEN 'receive' THEN 'issue' WHEN 'issue' THEN 'receive'
              WHEN 'return' THEN 'transfer' ELSE 'transfer' END;

  v_id := just_me_post_movement(
    p_org, m.item_id, v_type, m.quantity,
    CASE WHEN v_type IN ('issue','transfer') THEN COALESCE(m.destination_warehouse_id, m.source_warehouse_id) END,
    CASE WHEN v_type IN ('receive','transfer') THEN COALESCE(m.source_warehouse_id, m.destination_warehouse_id) END,
    m.reference_no, 'กลับรายการ: ' || p_reason, m.unit_cost,
    m.project_id, m.boq_item_id, NULL, NULL, m.requester_name, p_created_by,
    'rev:' || p_movement::text, p_reason, NULL);

  UPDATE just_me_stock_movements SET reversal_of_id = p_movement WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION just_me_reverse_movement(uuid,uuid,text,uuid) FROM public, anon, authenticated;

COMMENT ON FUNCTION just_me_reverse_movement(uuid,uuid,text,uuid) IS
  'กลับรายการเคลื่อนไหวคลัง — ออกรายการตรงข้ามผ่าน just_me_post_movement · กลับได้ครั้งเดียวต่อรายการ · service-role เท่านั้น';
