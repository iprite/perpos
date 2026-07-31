-- ต้นทุนเฉลี่ยต้องเท่ากับ มูลค่าคงเหลือ ÷ จำนวนคงเหลือ เสมอ — apply prod แล้ว 2026-07-31
--
-- prepare: เขียนทับ unit_cost เฉพาะเมื่อ "ไม่ได้ระบุมา" (เดิมทับทุกชนิดที่ไม่ใช่ receive)
--          การเบิกปกติที่ API ไม่ส่งราคา ยังใช้ avg เหมือนเดิมทุกประการ
--          ส่วนการกลับรายการที่ต้องถอนมูลค่าตามราคาต้นฉบับ จึงส่งราคาเข้ามาได้
CREATE OR REPLACE FUNCTION just_me_movement_cost_prepare()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avg numeric;
BEGIN
  SELECT avg_cost INTO v_avg FROM just_me_item_costs WHERE item_id = NEW.item_id;
  IF NEW.unit_cost IS NULL THEN
    NEW.unit_cost := v_avg;
  END IF;
  NEW.total_cost := ROUND(COALESCE(NEW.unit_cost, 0) * NEW.quantity, 2);
  RETURN NEW;
END;
$$;

-- commit: ตอนเบิกออก ให้คิด avg ใหม่จากของที่เหลือจริงเสมอ
--         (เบิกด้วยราคา avg ตามปกติ → ได้ค่าเดิมพอดี · กลับรายการ → avg กลับไปเท่าก่อนหน้า)
CREATE OR REPLACE FUNCTION just_me_movement_cost_commit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.movement_type = 'receive' THEN
    INSERT INTO just_me_item_costs (
      item_id, org_id, avg_cost, last_cost, last_purchase_at, qty_on_hand, value_on_hand, updated_at)
    VALUES (
      NEW.item_id, NEW.org_id, COALESCE(NEW.unit_cost, 0), NEW.unit_cost, NEW.created_at,
      NEW.quantity, COALESCE(NEW.total_cost, 0), now())
    ON CONFLICT (item_id) DO UPDATE SET
      qty_on_hand   = just_me_item_costs.qty_on_hand + NEW.quantity,
      value_on_hand = just_me_item_costs.value_on_hand + COALESCE(NEW.total_cost, 0),
      avg_cost      = CASE WHEN just_me_item_costs.qty_on_hand + NEW.quantity > 0
                           THEN (just_me_item_costs.value_on_hand + COALESCE(NEW.total_cost, 0))
                                / (just_me_item_costs.qty_on_hand + NEW.quantity)
                           ELSE just_me_item_costs.avg_cost END,
      last_cost        = COALESCE(NEW.unit_cost, just_me_item_costs.last_cost),
      last_purchase_at = GREATEST(COALESCE(just_me_item_costs.last_purchase_at, NEW.created_at), NEW.created_at),
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
