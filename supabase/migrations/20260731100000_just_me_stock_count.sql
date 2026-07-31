-- ตรวจนับสต๊อกจริง + ปรับยอด (just_me) — **apply บน prod แล้ว 2026-07-31**
-- ไฟล์นี้เขียนย้อนจากสถานะจริงบน prod (ตรวจสอบ column/default/constraint/trigger ผ่าน PostgREST)
-- ให้ repo กับ prod ตรงกัน — idempotent ทั้งไฟล์ รันซ้ำได้
--
-- กติกาที่ห้ามพัง:
--   1. ใบที่ `posted` แล้ว **แก้/ลบไม่ได้** (trigger เป็นด่านจริง ไม่ใช่ API)
--   2. ยอด `system_qty` = ยอดตามระบบตอนเปิดใบ (freeze) — ห้ามคำนวณใหม่ตอนลงบัญชี
--   3. การปรับยอดต้องเดินผ่าน `just_me_post_movement()` เท่านั้น (ห้าม update ยอดคงเหลือตรง ๆ)

-- ── คอลัมน์ใหม่บนความเคลื่อนไหวคลัง ─────────────────────────────────────────
ALTER TABLE just_me_stock_movements
  ADD COLUMN IF NOT EXISTS client_token      text,
  ADD COLUMN IF NOT EXISTS adjustment_reason text,
  ADD COLUMN IF NOT EXISTS stock_count_id    uuid;

COMMENT ON COLUMN just_me_stock_movements.client_token IS
  'กุญแจกันกดซ้ำ (idempotency) — ยิงซ้ำด้วย token เดิมได้ movement เดิม ไม่เกิดรายการที่สอง';
COMMENT ON COLUMN just_me_stock_movements.adjustment_reason IS
  'เหตุผลของการปรับยอด (บังคับเมื่อผลต่างจากการตรวจนับ ≠ 0)';

CREATE UNIQUE INDEX IF NOT EXISTS just_me_stock_movements_client_token_key
  ON just_me_stock_movements (org_id, client_token)
  WHERE client_token IS NOT NULL;

-- ── ใบตรวจนับ ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS just_me_stock_counts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES just_me_warehouses(id) ON DELETE RESTRICT,
  count_code   text NOT NULL,
  status       text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'posted', 'cancelled')),
  counted_date date NOT NULL DEFAULT CURRENT_DATE,
  note         text,
  posted_at    timestamptz,
  posted_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (org_id, count_code)
);

CREATE TABLE IF NOT EXISTS just_me_stock_count_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  count_id    uuid NOT NULL REFERENCES just_me_stock_counts(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES just_me_inventory_items(id) ON DELETE RESTRICT,
  -- ยอดตามระบบ ณ เวลาที่เปิดใบ (freeze) · counted_qty = NULL แปลว่ายังไม่ได้เดินนับบรรทัดนี้
  system_qty  numeric NOT NULL DEFAULT 0,
  counted_qty numeric,
  note        text,
  UNIQUE (count_id, item_id)
);

ALTER TABLE just_me_stock_movements
  DROP CONSTRAINT IF EXISTS just_me_stock_movements_stock_count_id_fkey;
ALTER TABLE just_me_stock_movements
  ADD CONSTRAINT just_me_stock_movements_stock_count_id_fkey
  FOREIGN KEY (stock_count_id) REFERENCES just_me_stock_counts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS just_me_stock_counts_org_idx
  ON just_me_stock_counts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS just_me_stock_count_items_count_idx
  ON just_me_stock_count_items (count_id);
CREATE INDEX IF NOT EXISTS just_me_stock_movements_stock_count_idx
  ON just_me_stock_movements (stock_count_id)
  WHERE stock_count_id IS NOT NULL;

-- ── ใบที่ลงบัญชีแล้ว = แช่แข็ง (ด่านจริงอยู่ที่นี่) ──────────────────────────
CREATE OR REPLACE FUNCTION just_me_stock_count_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'ใบตรวจนับที่ลงบัญชีแล้วลบไม่ได้' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'ใบตรวจนับที่ลงบัญชีแล้วแก้ไม่ได้ — ให้เปิดใบนับใหม่' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS just_me_stock_count_freeze_trg ON just_me_stock_counts;
CREATE TRIGGER just_me_stock_count_freeze_trg
  BEFORE UPDATE OR DELETE ON just_me_stock_counts
  FOR EACH ROW EXECUTE FUNCTION just_me_stock_count_freeze();

CREATE OR REPLACE FUNCTION just_me_stock_count_item_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM just_me_stock_counts
   WHERE id = COALESCE(NEW.count_id, OLD.count_id);
  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'ใบตรวจนับที่ลงบัญชีแล้วแก้ไม่ได้ — ให้เปิดใบนับใหม่' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS just_me_stock_count_item_freeze_trg ON just_me_stock_count_items;
CREATE TRIGGER just_me_stock_count_item_freeze_trg
  BEFORE INSERT OR UPDATE OR DELETE ON just_me_stock_count_items
  FOR EACH ROW EXECUTE FUNCTION just_me_stock_count_item_freeze();

-- ── RLS: อ่านได้ทุกสมาชิก · เขียนได้เฉพาะผู้ที่เห็นต้นทุน (เท่ากับยอดคงเหลือ) ──
ALTER TABLE just_me_stock_counts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE just_me_stock_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "just_me_stock_counts_select" ON just_me_stock_counts;
DROP POLICY IF EXISTS "just_me_stock_counts_insert" ON just_me_stock_counts;
DROP POLICY IF EXISTS "just_me_stock_counts_update" ON just_me_stock_counts;
DROP POLICY IF EXISTS "just_me_stock_counts_delete" ON just_me_stock_counts;
CREATE POLICY "just_me_stock_counts_select" ON just_me_stock_counts
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "just_me_stock_counts_insert" ON just_me_stock_counts
  FOR INSERT WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_stock_counts_update" ON just_me_stock_counts
  FOR UPDATE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id))
  WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_stock_counts_delete" ON just_me_stock_counts
  FOR DELETE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

DROP POLICY IF EXISTS "just_me_stock_count_items_select" ON just_me_stock_count_items;
DROP POLICY IF EXISTS "just_me_stock_count_items_insert" ON just_me_stock_count_items;
DROP POLICY IF EXISTS "just_me_stock_count_items_update" ON just_me_stock_count_items;
DROP POLICY IF EXISTS "just_me_stock_count_items_delete" ON just_me_stock_count_items;
CREATE POLICY "just_me_stock_count_items_select" ON just_me_stock_count_items
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "just_me_stock_count_items_insert" ON just_me_stock_count_items
  FOR INSERT WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_stock_count_items_update" ON just_me_stock_count_items
  FOR UPDATE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id))
  WITH CHECK (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));
CREATE POLICY "just_me_stock_count_items_delete" ON just_me_stock_count_items
  FOR DELETE USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

REVOKE ALL ON just_me_stock_counts, just_me_stock_count_items FROM anon;

COMMENT ON TABLE just_me_stock_counts IS
  'ใบตรวจนับสต๊อกจริงต่อคลัง — draft → posted (ปรับยอดผ่าน just_me_post_movement เท่านั้น) / cancelled · ใบที่ posted แช่แข็งด้วย trigger';
