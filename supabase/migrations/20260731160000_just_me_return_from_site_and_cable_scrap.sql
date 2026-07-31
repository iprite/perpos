-- "คืนของ" = ของที่เบิกไปหน้างานแล้วใช้ไม่หมด เอากลับเข้าคลัง — ยังไม่ apply prod
--
-- ปัญหาเดิม (พิสูจน์จาก prod: serial 16 เส้นสถานะ issued กลับเข้าคลังไม่ได้เลย):
--   · `return` ถูกทำเป็น "โอนคลัง→คลัง" ⇒ บังคับเลือกคลังต้นทางแล้วหักยอดต้นทางซ้ำอีกรอบ
--     แต่ของถูกหักไปแล้วตอนเบิก ⇒ ด่าน "คงเหลือไม่พอ" เด้งทุกครั้ง คืนของไม่ได้จริง
--   · ทะเบียน serial ก็หาเส้นที่ `in_stock` ในคลังต้นทาง ซึ่งไม่มีวันเจอ (เส้นนั้นสถานะ `issued`)
--
-- กติกาใหม่ (ตรงกับงานจริงของผู้รับเหมา):
--   · `return` **ไม่มีคลังต้นทาง** (ต้นทาง = หน้างาน) มีแต่คลังปลายทาง ⇒ ยอดปลายทางเพิ่มอย่างเดียว
--   · ของกลับเข้าคลัง = มูลค่ากลับเข้าฐานต้นทุนด้วย (ตีด้วยต้นทุนเฉลี่ย ณ ตอนนั้น ⇒ avg ไม่ขยับ)
--     ไม่งั้น `just_me_stock_balances` จะโตกว่า `just_me_item_costs.qty_on_hand` = มูลค่าสต๊อกต่ำกว่าจริงถาวร
--   · แถว `return` เก่าที่มีคลังต้นทาง (ท่าโอนคลัง) ยังกลับรายการได้เหมือนเดิม

-- ─────────────────────────────────────────────────────────────
-- 1) post_movement — return ต้องไม่มีคลังต้นทาง
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

-- ─────────────────────────────────────────────────────────────
-- 2) ต้นทุนเฉลี่ย — ของที่คืนกลับคลังต้องกลับเข้าฐานมูลค่าด้วย
--    (คืนด้วยต้นทุนเฉลี่ยปัจจุบัน ⇒ avg เท่าเดิมเป๊ะ · กลับรายการเบิกยังทำผ่าน reverse เหมือนเดิม)
--    แถว return เก่าที่เป็นการโอนคลัง→คลัง จะเข้าเงื่อนไขนี้ไม่ได้ เพราะมีคลังต้นทาง
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION just_me_movement_cost_commit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.movement_type = 'receive'
     OR (NEW.movement_type = 'return' AND NEW.source_warehouse_id IS NULL) THEN
    INSERT INTO just_me_item_costs (
      item_id, org_id, avg_cost, last_cost, last_purchase_at, qty_on_hand, value_on_hand, updated_at)
    VALUES (
      NEW.item_id, NEW.org_id, COALESCE(NEW.unit_cost, 0),
      CASE WHEN NEW.movement_type = 'receive' THEN NEW.unit_cost END,
      CASE WHEN NEW.movement_type = 'receive' THEN NEW.created_at END,
      NEW.quantity, COALESCE(NEW.total_cost, 0), now())
    ON CONFLICT (item_id) DO UPDATE SET
      qty_on_hand   = just_me_item_costs.qty_on_hand + NEW.quantity,
      value_on_hand = just_me_item_costs.value_on_hand + COALESCE(NEW.total_cost, 0),
      avg_cost      = CASE WHEN just_me_item_costs.qty_on_hand + NEW.quantity > 0
                           THEN (just_me_item_costs.value_on_hand + COALESCE(NEW.total_cost, 0))
                                / (just_me_item_costs.qty_on_hand + NEW.quantity)
                           ELSE just_me_item_costs.avg_cost END,
      -- ราคาซื้อล่าสุด/วันซื้อล่าสุด = เรื่องของการ "ซื้อ" เท่านั้น การคืนของไม่แตะ
      last_cost        = CASE WHEN NEW.movement_type = 'receive'
                              THEN COALESCE(NEW.unit_cost, just_me_item_costs.last_cost)
                              ELSE just_me_item_costs.last_cost END,
      last_purchase_at = CASE WHEN NEW.movement_type = 'receive'
                              THEN GREATEST(COALESCE(just_me_item_costs.last_purchase_at, NEW.created_at), NEW.created_at)
                              ELSE just_me_item_costs.last_purchase_at END,
      updated_at       = now();

  ELSIF NEW.movement_type = 'issue' THEN
    UPDATE just_me_item_costs SET
      qty_on_hand   = GREATEST(qty_on_hand - NEW.quantity, 0),
      value_on_hand = GREATEST(value_on_hand - COALESCE(NEW.total_cost, 0), 0),
      avg_cost      = CASE WHEN GREATEST(qty_on_hand - NEW.quantity, 0) > 0
                           THEN GREATEST(value_on_hand - COALESCE(NEW.total_cost, 0), 0)
                                / GREATEST(qty_on_hand - NEW.quantity, 0)
                           ELSE avg_cost END,
      updated_at    = now()
    WHERE item_id = NEW.item_id;
  END IF;
  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) กลับรายการ — คืนของแบบใหม่ต้องกลับด้วย "เบิกออกจากคลังปลายทาง"
--    (แถว return เก่าที่มีคลังต้นทาง ยังกลับด้วยการโอนสวนทางเหมือนเดิม)
-- ─────────────────────────────────────────────────────────────
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

  v_type := CASE
              WHEN m.movement_type = 'receive' THEN 'issue'
              WHEN m.movement_type = 'issue'   THEN 'receive'
              WHEN m.movement_type = 'return'  THEN
                CASE WHEN m.source_warehouse_id IS NULL THEN 'issue' ELSE 'transfer' END
              ELSE 'transfer' END;

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

COMMENT ON FUNCTION just_me_post_movement IS
  'บันทึกความเคลื่อนไหวคลัง + ยอดคงเหลือแบบ atomic (ล็อกแถวยอดต้นทางกัน race · client_token กันกดซ้ำ) — service-role เท่านั้น ด่านสิทธิ์อยู่ที่ API · return = คืนจากหน้างาน ไม่มีคลังต้นทาง';
