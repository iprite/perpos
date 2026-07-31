-- "คืนของ" ต้องผูกกับของที่เบิกออกไปจริง — ปิด 2 ช่องที่พิสูจน์บน prod แล้ว
--
-- B1 สร้างของจากอากาศ: หลัง 20260731160000 `return` ไม่มีคลังต้นทาง ⇒ ไม่มีการหักที่ไหนเลย
--    และไม่เทียบกับยอดที่เบิกไป ⇒ เบิก 10 แล้วคืน 50 ผ่านฉลุย (ยอดคลัง +50, มูลค่า +2,250 ฿ ที่ไม่เคยซื้อ)
--    ก่อน migration นั้นทำไม่ได้ (return เป็นโอนคลัง ต้องมีของต้นทาง) = regression ด้านการควบคุม
--
-- B2 ต้นทุนโครงการติดลบ: คืนของถูกตีด้วย avg ณ "วันคืน" ⇒ เบิก 10 ตอน avg 15 (+150)
--    → ซื้อรอบใหม่ 10@45 (avg=45) → คืนของเดิม 10 ชิ้น (−450) ⇒ ต้นทุนโครงการ = −300 ฿
--
-- กติกาใหม่: คืนได้ไม่เกิน (เบิกสะสม − คืนสะสม) และตีมูลค่าแบบ FIFO ตามราคาที่เบิกออกไปจริง
--   · ระบุโครงการ = นับเฉพาะการเบิกของโครงการนั้น · ไม่ระบุ = นับทั้งวัสดุ
--   · การเบิกที่ถูกกลับรายการไปแล้ว ไม่นับเป็นของที่คืนได้
--   · แถว return เก่าที่เป็นการโอนคลัง (มีคลังต้นทาง) ไม่นับในสมการนี้

-- ─────────────────────────────────────────────────────────────
-- ฐานการคืน: คืนได้เท่าไร และของที่กำลังคืนมีต้นทุนเท่าไร (FIFO)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS just_me_return_basis(uuid, uuid, uuid, numeric);
CREATE FUNCTION just_me_return_basis(
  p_org     uuid,
  p_item    uuid,
  p_project uuid,
  p_qty     numeric,
  OUT ret_allowed_qty numeric,
  OUT ret_unit_cost   numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_returned numeric;
BEGIN
  -- นับเฉพาะการเคลื่อนไหวที่ยังมีผล (ไม่ถูกกลับรายการ และไม่ใช่ตัวกลับรายการเอง)
  WITH live AS (
    SELECT m.*
      FROM just_me_stock_movements m
     WHERE m.org_id = p_org
       AND m.item_id = p_item
       AND m.reversal_of_id IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM just_me_stock_movements r WHERE r.reversal_of_id = m.id
           )
       AND (p_project IS NULL OR m.project_id = p_project)
  )
  SELECT
    COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'issue'), 0)
      - COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'return'
                                         AND source_warehouse_id IS NULL), 0),
    COALESCE(SUM(quantity) FILTER (WHERE movement_type = 'return'
                                     AND source_warehouse_id IS NULL), 0)
    INTO ret_allowed_qty, v_returned
    FROM live;

  ret_allowed_qty := GREATEST(COALESCE(ret_allowed_qty, 0), 0);
  IF p_qty IS NULL OR p_qty <= 0 OR p_qty > ret_allowed_qty THEN
    ret_unit_cost := NULL;
    RETURN;
  END IF;

  -- FIFO: ข้ามส่วนที่คืนไปแล้ว แล้วหยิบ p_qty ถัดไปจากใบเบิกตามลำดับเวลา
  --        (ตั้ง alias ให้คอลัมน์ทุกตัว — ชื่อ `unit_cost` ชนกับ OUT param ของฟังก์ชันนี้)
  WITH live AS (
    SELECT m.quantity AS q, COALESCE(m.unit_cost, 0) AS uc, m.created_at AS ca, m.id AS mid
      FROM just_me_stock_movements m
     WHERE m.org_id = p_org
       AND m.item_id = p_item
       AND m.movement_type = 'issue'
       AND m.reversal_of_id IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM just_me_stock_movements r WHERE r.reversal_of_id = m.id
           )
       AND (p_project IS NULL OR m.project_id = p_project)
  ), running AS (
    SELECT q, uc, SUM(q) OVER (ORDER BY ca, mid) AS cum FROM live
  ), slice AS (
    SELECT uc,
           GREATEST(LEAST(cum, v_returned + p_qty) - GREATEST(cum - q, v_returned), 0) AS take
      FROM running
  )
  SELECT ROUND(SUM(take * uc) / NULLIF(SUM(take), 0), 6) INTO ret_unit_cost FROM slice;

  ret_unit_cost := COALESCE(ret_unit_cost, 0);
END;
$$;

REVOKE ALL ON FUNCTION just_me_return_basis(uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- ใส่ด่านเข้า post_movement (ส่วนอื่นเหมือน 20260731180000 ทุกประการ)
-- ─────────────────────────────────────────────────────────────
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
  v_allowed  numeric;
  v_ret_cost numeric;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('receive', 'transfer', 'issue', 'return') THEN
    RAISE EXCEPTION 'ประเภทรายการเคลื่อนไหวไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'จำนวนต้องมากกว่า 0' USING ERRCODE = '22023';
  END IF;

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

  IF p_type IN ('transfer', 'issue') AND p_src IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังต้นทาง' USING ERRCODE = '22023';
  END IF;
  IF p_type IN ('receive', 'transfer', 'return') AND p_dst IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังปลายทาง' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'return' AND p_src IS NOT NULL THEN
    RAISE EXCEPTION 'รายการคืนของไม่ต้องระบุคลังต้นทาง (ของถูกหักออกจากคลังไปแล้วตอนเบิก)'
      USING ERRCODE = '22023';
  END IF;
  IF p_type = 'receive' AND p_src IS NOT NULL THEN
    RAISE EXCEPTION 'รายการรับเข้าไม่ต้องระบุคลังต้นทาง' USING ERRCODE = '22023';
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

  IF p_project IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM just_me_projects WHERE id = p_project AND org_id = p_org
  ) THEN
    RAISE EXCEPTION 'ไม่พบโครงการในองค์กรนี้' USING ERRCODE = '22023';
  END IF;
  IF p_boq_item IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM just_me_boq_items WHERE id = p_boq_item AND org_id = p_org
  ) THEN
    RAISE EXCEPTION 'ไม่พบรายการ BOQ ในองค์กรนี้' USING ERRCODE = '22023';
  END IF;
  IF p_purchase_request IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM just_me_purchase_requests WHERE id = p_purchase_request AND org_id = p_org
  ) THEN
    RAISE EXCEPTION 'ไม่พบใบขอซื้อในองค์กรนี้' USING ERRCODE = '22023';
  END IF;
  IF p_stock_count IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM just_me_stock_counts WHERE id = p_stock_count AND org_id = p_org
  ) THEN
    RAISE EXCEPTION 'ไม่พบใบตรวจนับในองค์กรนี้' USING ERRCODE = '22023';
  END IF;
  IF p_requested_by IS NOT NULL AND NOT is_org_member(p_org, p_requested_by) THEN
    RAISE EXCEPTION 'ผู้เบิกไม่ได้เป็นสมาชิกขององค์กรนี้' USING ERRCODE = '22023';
  END IF;

  -- คืนของ: ห้ามเกินที่เบิกไป และตีมูลค่าด้วยราคาที่เบิกออกไปจริง (ไม่ใช่ avg วันคืน)
  IF p_type = 'return' THEN
    SELECT ret_allowed_qty, ret_unit_cost INTO v_allowed, v_ret_cost
      FROM just_me_return_basis(p_org, p_item, p_project, p_qty);
    IF p_qty > v_allowed THEN
      RAISE EXCEPTION 'คืนได้ไม่เกินที่เบิกไปแล้ว (คืนได้อีก % %)', v_allowed, v_unit
        USING ERRCODE = '22023';
    END IF;
    p_unit_cost := COALESCE(p_unit_cost, v_ret_cost);
  END IF;

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

REVOKE ALL ON FUNCTION just_me_post_movement(
  uuid, uuid, text, numeric, uuid, uuid, text, text, numeric,
  uuid, uuid, uuid, uuid, text, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
