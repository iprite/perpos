-- just_me inventory: (1) พิกัดที่ตั้งคลัง (2) ผู้เบิก (3) ฐานต้นทุน + ต้นทุนเฉลี่ยถ่วงน้ำหนัก
-- 2026-07-30

-- ─────────────────────────────────────────────────────────────
-- 1) ที่ตั้งคลัง — พิกัด + ผู้ดูแลหน้างาน
-- ─────────────────────────────────────────────────────────────
ALTER TABLE just_me_warehouses
  ADD COLUMN IF NOT EXISTS latitude      numeric,
  ADD COLUMN IF NOT EXISTS longitude     numeric,
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

-- ─────────────────────────────────────────────────────────────
-- 2) ผู้เบิก / ผู้รับของ + ต้นทุนต่อรายการเคลื่อนไหว
--    requested_by  = สมาชิก org (มีบัญชี)
--    requester_name = ช่าง/ทีมที่ไม่มีบัญชีในระบบ (free text)
--    created_by ยังคงหมายถึง "ผู้บันทึกรายการ" ตามเดิม
-- ─────────────────────────────────────────────────────────────
ALTER TABLE just_me_stock_movements
  ADD COLUMN IF NOT EXISTS requested_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS unit_cost      numeric,
  ADD COLUMN IF NOT EXISTS total_cost     numeric;

CREATE INDEX IF NOT EXISTS just_me_stock_movements_requested_by_idx
  ON just_me_stock_movements(requested_by);
CREATE INDEX IF NOT EXISTS just_me_stock_movements_org_created_idx
  ON just_me_stock_movements(org_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3) ฐานต้นทุนต่อวัสดุ (moving weighted average)
--    invariant: qty_on_hand = ผลรวม just_me_stock_balances ของวัสดุนั้น
--    → receive เพิ่ม, issue ลด, transfer/return เป็นการย้ายภายใน (ไม่กระทบ)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS just_me_item_costs (
  item_id          uuid        PRIMARY KEY REFERENCES just_me_inventory_items(id) ON DELETE CASCADE,
  org_id           uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  avg_cost         numeric     NOT NULL DEFAULT 0,
  last_cost        numeric,
  last_purchase_at timestamptz,
  qty_on_hand      numeric     NOT NULL DEFAULT 0,
  value_on_hand    numeric     NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE just_me_item_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "just_me_item_costs_select" ON just_me_item_costs;
CREATE POLICY "just_me_item_costs_select"
  ON just_me_item_costs FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "just_me_item_costs_write" ON just_me_item_costs;
CREATE POLICY "just_me_item_costs_write"
  ON just_me_item_costs FOR ALL
  USING (is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_org_admin(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS just_me_item_costs_org_idx ON just_me_item_costs(org_id);

-- 3.1 เติมต้นทุนของรายการเคลื่อนไหวก่อนบันทึก
--     receive: ใช้ราคาซื้อที่กรอก (ไม่กรอก = ใช้ต้นทุนเฉลี่ยล่าสุด)
--     issue/transfer/return: ตีมูลค่าด้วยต้นทุนเฉลี่ย ณ เวลานั้น
CREATE OR REPLACE FUNCTION just_me_movement_cost_prepare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg numeric;
BEGIN
  SELECT avg_cost INTO v_avg FROM just_me_item_costs WHERE item_id = NEW.item_id;

  IF NEW.movement_type = 'receive' THEN
    IF NEW.unit_cost IS NULL THEN
      NEW.unit_cost := v_avg;   -- ไม่ได้กรอกราคา → ใช้ต้นทุนเฉลี่ยเดิม
    END IF;
  ELSE
    NEW.unit_cost := COALESCE(v_avg, 0);
  END IF;

  NEW.total_cost := ROUND(COALESCE(NEW.unit_cost, 0) * NEW.quantity, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_movement_cost_prepare ON just_me_stock_movements;
CREATE TRIGGER trg_just_me_movement_cost_prepare
  BEFORE INSERT ON just_me_stock_movements
  FOR EACH ROW EXECUTE FUNCTION just_me_movement_cost_prepare();

-- 3.2 อัปเดตต้นทุนเฉลี่ยถ่วงน้ำหนักหลังบันทึก
CREATE OR REPLACE FUNCTION just_me_movement_cost_commit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.movement_type = 'receive' THEN
    INSERT INTO just_me_item_costs (
      item_id, org_id, avg_cost, last_cost, last_purchase_at,
      qty_on_hand, value_on_hand, updated_at
    )
    VALUES (
      NEW.item_id, NEW.org_id, COALESCE(NEW.unit_cost, 0), NEW.unit_cost, NEW.created_at,
      NEW.quantity, COALESCE(NEW.total_cost, 0), now()
    )
    ON CONFLICT (item_id) DO UPDATE SET
      qty_on_hand   = just_me_item_costs.qty_on_hand + NEW.quantity,
      value_on_hand = just_me_item_costs.value_on_hand + COALESCE(NEW.total_cost, 0),
      avg_cost      = CASE
                        WHEN just_me_item_costs.qty_on_hand + NEW.quantity > 0
                        THEN (just_me_item_costs.value_on_hand + COALESCE(NEW.total_cost, 0))
                             / (just_me_item_costs.qty_on_hand + NEW.quantity)
                        ELSE just_me_item_costs.avg_cost
                      END,
      last_cost        = COALESCE(NEW.unit_cost, just_me_item_costs.last_cost),
      last_purchase_at = GREATEST(COALESCE(just_me_item_costs.last_purchase_at, NEW.created_at), NEW.created_at),
      updated_at       = now();

  ELSIF NEW.movement_type = 'issue' THEN
    -- เบิกใช้งาน = ของออกจากระบบ ตัดมูลค่าด้วยต้นทุนเฉลี่ย (avg_cost ไม่เปลี่ยน)
    UPDATE just_me_item_costs SET
      qty_on_hand   = GREATEST(qty_on_hand - NEW.quantity, 0),
      value_on_hand = GREATEST(value_on_hand - COALESCE(NEW.total_cost, 0), 0),
      updated_at    = now()
    WHERE item_id = NEW.item_id;
  END IF;
  -- transfer / return = ย้ายระหว่างคลัง ไม่กระทบมูลค่ารวมและต้นทุนเฉลี่ย

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_movement_cost_commit ON just_me_stock_movements;
CREATE TRIGGER trg_just_me_movement_cost_commit
  AFTER INSERT ON just_me_stock_movements
  FOR EACH ROW EXECUTE FUNCTION just_me_movement_cost_commit();

-- ─────────────────────────────────────────────────────────────
-- 4) แนวโน้มต้นทุนรายเดือน (ราคาซื้อเฉลี่ย + มูลค่าที่เบิกใช้)
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS just_me_item_cost_monthly;
CREATE VIEW just_me_item_cost_monthly
WITH (security_invoker = true) AS
SELECT
  m.org_id,
  m.item_id,
  date_trunc('month', m.created_at)::date                                              AS month,
  SUM(CASE WHEN m.movement_type = 'receive' THEN m.quantity ELSE 0 END)                AS qty_received,
  SUM(CASE WHEN m.movement_type = 'receive' THEN COALESCE(m.total_cost, 0) ELSE 0 END) AS value_received,
  CASE
    WHEN SUM(CASE WHEN m.movement_type = 'receive' THEN m.quantity ELSE 0 END) > 0
    THEN SUM(CASE WHEN m.movement_type = 'receive' THEN COALESCE(m.total_cost, 0) ELSE 0 END)
         / SUM(CASE WHEN m.movement_type = 'receive' THEN m.quantity ELSE 0 END)
  END                                                                                   AS avg_purchase_cost,
  SUM(CASE WHEN m.movement_type = 'issue' THEN m.quantity ELSE 0 END)                  AS qty_issued,
  SUM(CASE WHEN m.movement_type = 'issue' THEN COALESCE(m.total_cost, 0) ELSE 0 END)   AS value_issued
FROM just_me_stock_movements m
WHERE m.movement_type IN ('receive', 'issue')
GROUP BY m.org_id, m.item_id, date_trunc('month', m.created_at);

REVOKE ALL ON just_me_item_cost_monthly FROM anon;
