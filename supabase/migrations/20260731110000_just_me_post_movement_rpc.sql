-- just_me_post_movement() — บันทึกความเคลื่อนไหวคลัง + ยอดคงเหลือแบบ atomic
-- **apply บน prod แล้ว 2026-07-31** — ไฟล์นี้เขียนย้อนจากฟังก์ชันจริงบน prod (พฤติกรรม/ข้อความ error ตรวจสอบด้วยการยิงจริง)
--
-- ทำไมต้องมี: ของเดิม API ทำ "insert movement → select ยอด → update ยอด" เป็น 3 คำสั่งแยก
--   ⇒ (ก) ยิงพร้อมกัน 2 ครั้ง = อ่านยอดเดียวกันแล้วเขียนทับกัน ยอดหาย
--      (ข) กดปุ่มซ้ำ/เน็ตหลุด = ได้ 2 รายการ ต้นทุนเฉลี่ยเพี้ยนถาวร
--      (ค) insert สำเร็จแต่ update ยอดพลาด = ยอดกับประวัติไม่ตรงกันตลอดกาล
--
-- กติกา:
--   · SECURITY DEFINER + REVOKE จาก anon/authenticated ⇒ เรียกได้ด้วย service-role เท่านั้น
--     **ด่านสิทธิ์ (owner/manager, org membership) อยู่ที่ชั้น API** — ฟังก์ชันนี้ไม่ตรวจ role
--   · ห้ามเขียน `total_cost` เอง — trigger ต้นทุนเฉลี่ยของคลังคิดให้ (invariant just_me ข้อ 3)
--   · `p_client_token` ซ้ำ = คืน movement เดิม (ไม่เกิดรายการที่สอง)
--   · ข้อความ error เป็นภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง + ERRCODE 22023 ⇒ API แปลงเป็น HTTP 400

CREATE OR REPLACE FUNCTION just_me_post_movement(
  p_org               uuid,
  p_item              uuid,
  p_type              text,
  p_qty               numeric,
  p_src               uuid    DEFAULT NULL,
  p_dst               uuid    DEFAULT NULL,
  p_reference_no      text    DEFAULT NULL,
  p_note              text    DEFAULT NULL,
  p_unit_cost         numeric DEFAULT NULL,
  p_project           uuid    DEFAULT NULL,
  p_boq_item          uuid    DEFAULT NULL,
  p_purchase_request  uuid    DEFAULT NULL,
  p_requested_by      uuid    DEFAULT NULL,
  p_requester_name    text    DEFAULT NULL,
  p_created_by        uuid    DEFAULT NULL,
  p_client_token      text    DEFAULT NULL,
  p_adjustment_reason text    DEFAULT NULL,
  p_stock_count       uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing uuid;
  v_unit     text;
  v_current  numeric;
  v_movement uuid;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('receive', 'transfer', 'issue', 'return') THEN
    RAISE EXCEPTION 'ประเภทรายการเคลื่อนไหวไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'จำนวนต้องมากกว่า 0' USING ERRCODE = '22023';
  END IF;

  -- กดซ้ำ = ได้รายการเดิม (ไม่แตะยอดอีกรอบ)
  IF p_client_token IS NOT NULL THEN
    SELECT id INTO v_existing FROM just_me_stock_movements
     WHERE org_id = p_org AND client_token = p_client_token;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT unit INTO v_unit FROM just_me_inventory_items
   WHERE id = p_item AND org_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบวัสดุในองค์กรนี้' USING ERRCODE = '22023';
  END IF;

  IF p_type IN ('transfer', 'issue', 'return') AND p_src IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังต้นทาง' USING ERRCODE = '22023';
  END IF;
  IF p_type IN ('receive', 'transfer', 'return') AND p_dst IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังปลายทาง' USING ERRCODE = '22023';
  END IF;

  IF p_src IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM just_me_warehouses WHERE id = p_src AND org_id = p_org
  ) THEN
    RAISE EXCEPTION 'ไม่พบคลังต้นทางในองค์กรนี้' USING ERRCODE = '22023';
  END IF;
  IF p_dst IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM just_me_warehouses WHERE id = p_dst AND org_id = p_org
  ) THEN
    RAISE EXCEPTION 'ไม่พบคลังปลายทางในองค์กรนี้' USING ERRCODE = '22023';
  END IF;

  -- ล็อกแถวยอดต้นทางก่อนอ่าน ⇒ สองคำขอพร้อมกันเข้าคิวกัน (กันเบิกเกินจาก race)
  IF p_src IS NOT NULL THEN
    SELECT quantity INTO v_current FROM just_me_stock_balances
     WHERE org_id = p_org AND warehouse_id = p_src AND item_id = p_item
     FOR UPDATE;
    v_current := COALESCE(v_current, 0);
    IF v_current < p_qty THEN
      RAISE EXCEPTION 'สินค้าคงเหลือในคลังต้นทางไม่พอ (มีอยู่ % %)', v_current, v_unit
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO just_me_stock_movements (
    org_id, item_id, movement_type, source_warehouse_id, destination_warehouse_id,
    quantity, reference_no, note, unit_cost, project_id, boq_item_id, purchase_request_id,
    requested_by, requester_name, created_by, client_token, adjustment_reason, stock_count_id
  ) VALUES (
    p_org, p_item, p_type, p_src, p_dst,
    p_qty, p_reference_no, p_note, p_unit_cost, p_project, p_boq_item, p_purchase_request,
    p_requested_by, p_requester_name, p_created_by, p_client_token, p_adjustment_reason, p_stock_count
  ) RETURNING id INTO v_movement;

  IF p_src IS NOT NULL THEN
    UPDATE just_me_stock_balances
       SET quantity = quantity - p_qty, updated_at = now()
     WHERE org_id = p_org AND warehouse_id = p_src AND item_id = p_item;
  END IF;

  IF p_dst IS NOT NULL THEN
    INSERT INTO just_me_stock_balances (org_id, warehouse_id, item_id, quantity, updated_at)
    VALUES (p_org, p_dst, p_item, p_qty, now())
    ON CONFLICT (warehouse_id, item_id)
    DO UPDATE SET quantity = just_me_stock_balances.quantity + EXCLUDED.quantity,
                  updated_at = now();
  END IF;

  RETURN v_movement;
END $$;

COMMENT ON FUNCTION just_me_post_movement IS
  'บันทึกความเคลื่อนไหวคลัง + ยอดคงเหลือแบบ atomic (ล็อกแถวยอดต้นทางกัน race · client_token กันกดซ้ำ) — service-role เท่านั้น ด่านสิทธิ์อยู่ที่ API';

REVOKE ALL ON FUNCTION just_me_post_movement(
  uuid, uuid, text, numeric, uuid, uuid, text, text, numeric,
  uuid, uuid, uuid, uuid, text, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
