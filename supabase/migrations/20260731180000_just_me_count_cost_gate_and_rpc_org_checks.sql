-- ปิดช่องจากรีวิวความปลอดภัยรอบ 3 (พิสูจน์บน prod แล้ว)
--
-- 1) ใบตรวจนับ: `_select` เป็น `is_org_member` เฉย ๆ ⇒ viewer (= ผู้รับเหมาช่วงตัวจริง)
--    ยิง PostgREST ตรงอ่านผลนับทุกคลัง + ช่อง `note` ที่บังคับกรอก "เหตุผลของหาย" ได้
--    ทั้งที่ API ทุก handler บังคับ cost+write อยู่แล้ว ⇒ RLS หลวมกว่าเจตนาของโมดูล
--
-- 2) `just_me_post_movement` ตรวจ org ให้แค่ item/คลังต้นทาง/คลังปลายทาง แต่โฆษณาตัวเองว่าเป็น
--    "ทางเดียวของการเขียนคลัง" ⇒ caller คนถัดไปจะเชื่อแล้วผูก movement ข้าม org
--    (ชื่อโครงการ/PR ของ org อื่นโผล่ในรายงาน) — ปิดที่ฟังก์ชันให้ครบทุก FK

-- ─────────────────────────────────────────────────────────────
-- 1) ต้นทุน/ผลนับ = ข้อมูลชั้นใน ต้องผ่านด่านเดียวกับที่อื่นทั้งโมดูล
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "just_me_stock_counts_select" ON just_me_stock_counts;
CREATE POLICY "just_me_stock_counts_select"
  ON just_me_stock_counts FOR SELECT
  USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

DROP POLICY IF EXISTS "just_me_stock_count_items_select" ON just_me_stock_count_items;
CREATE POLICY "just_me_stock_count_items_select"
  ON just_me_stock_count_items FOR SELECT
  USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

-- ─────────────────────────────────────────────────────────────
-- 2) ตรวจ org ให้ครบทุก FK ที่ผูกกับ movement
--    (เนื้อในเหมือน 20260731160000 ทุกประการ — เพิ่มเฉพาะบล็อกตรวจ org)
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

  IF p_type IN ('transfer', 'issue') AND p_src IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังต้นทาง' USING ERRCODE = '22023';
  END IF;
  IF p_type IN ('receive', 'transfer', 'return') AND p_dst IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุคลังปลายทาง' USING ERRCODE = '22023';
  END IF;
  -- คืนของมาจากหน้างาน ไม่ใช่จากคลัง — ถ้าปล่อยให้ส่งคลังต้นทางมาได้ ยอดจะถูกหักซ้ำ
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

  -- ทุก FK ที่เหลือต้องอยู่ org เดียวกัน — ฟังก์ชันนี้คือทางเดียวที่เขียนคลัง
  -- caller จะเชื่อว่าตรวจให้แล้ว จึงห้ามปล่อยให้ผูกข้าม org ที่ชั้นนี้
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
    ON CONFLICT (warehouse_id, item_id) DO UPDATE
      SET quantity = just_me_stock_balances.quantity + EXCLUDED.quantity, updated_at = now();
  END IF;

  RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION just_me_post_movement(
  uuid, uuid, text, numeric, uuid, uuid, text, text, numeric,
  uuid, uuid, uuid, uuid, text, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
