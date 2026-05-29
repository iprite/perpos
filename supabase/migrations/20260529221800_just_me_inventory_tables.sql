-- Database migration for Inventory & Stock Management (just-me module)
-- Created at: 2026-05-29

-- 1. Warehouses (Central Warehouse & Site Storages)
CREATE TABLE IF NOT EXISTS just_me_warehouses (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  type              text        NOT NULL CHECK (type IN ('central', 'site')),
  location_address  text,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE just_me_warehouses ENABLE ROW LEVEL SECURITY;

-- Select: Any org member can view warehouses
CREATE POLICY "just_me_warehouses_select"
  ON just_me_warehouses FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Insert/Update/Delete: Only org admins/owners can manage warehouses
CREATE POLICY "just_me_warehouses_write"
  ON just_me_warehouses FOR ALL
  USING (is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_org_admin(org_id, auth.uid()));


-- 2. Inventory Items
CREATE TABLE IF NOT EXISTS just_me_inventory_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  code                  text        NOT NULL,
  description           text,
  unit                  text        NOT NULL DEFAULT 'ชิ้น',
  has_serial            boolean     NOT NULL DEFAULT false,
  has_cable_measurement boolean     NOT NULL DEFAULT false,
  conversion_rate       numeric     NOT NULL DEFAULT 1,
  min_stock             numeric     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

-- Enable RLS
ALTER TABLE just_me_inventory_items ENABLE ROW LEVEL SECURITY;

-- Select: Any org member can view items
CREATE POLICY "just_me_inventory_items_select"
  ON just_me_inventory_items FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Write: Only org admins/owners can manage items
CREATE POLICY "just_me_inventory_items_write"
  ON just_me_inventory_items FOR ALL
  USING (is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_org_admin(org_id, auth.uid()));


-- 3. Stock Balances (Item counts per warehouse)
CREATE TABLE IF NOT EXISTS just_me_stock_balances (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id  uuid        NOT NULL REFERENCES just_me_warehouses(id) ON DELETE CASCADE,
  item_id       uuid        NOT NULL REFERENCES just_me_inventory_items(id) ON DELETE CASCADE,
  quantity      numeric     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, item_id)
);

-- Enable RLS
ALTER TABLE just_me_stock_balances ENABLE ROW LEVEL SECURITY;

-- Select: Any org member can view stock balances
CREATE POLICY "just_me_stock_balances_select"
  ON just_me_stock_balances FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Write: Any org member can update stock balances as part of logs/movements
CREATE POLICY "just_me_stock_balances_write"
  ON just_me_stock_balances FOR ALL
  USING (is_org_member(org_id, auth.uid()))
  WITH CHECK (is_org_member(org_id, auth.uid()));


-- 4. Item Serials / Cable Segments (for Tracking Serial/Batch and scrap lengths)
CREATE TABLE IF NOT EXISTS just_me_item_serials (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id           uuid        NOT NULL REFERENCES just_me_inventory_items(id) ON DELETE CASCADE,
  warehouse_id      uuid        NOT NULL REFERENCES just_me_warehouses(id) ON DELETE CASCADE,
  serial_number     text        NOT NULL,
  status            text        NOT NULL CHECK (status IN ('in_stock', 'transferred', 'issued', 'returned')),
  is_scrap          boolean     NOT NULL DEFAULT false,
  length_remaining  numeric, -- null if not cable, meters remaining if cable
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, item_id, serial_number)
);

-- Enable RLS
ALTER TABLE just_me_item_serials ENABLE ROW LEVEL SECURITY;

-- Select: Any org member can view serials
CREATE POLICY "just_me_item_serials_select"
  ON just_me_item_serials FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Write: Any org member can manage serials (e.g. status changes during transfers/issues)
CREATE POLICY "just_me_item_serials_write"
  ON just_me_item_serials FOR ALL
  USING (is_org_member(org_id, auth.uid()))
  WITH CHECK (is_org_member(org_id, auth.uid()));


-- 5. Stock Movements
CREATE TABLE IF NOT EXISTS just_me_stock_movements (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id                   uuid        NOT NULL REFERENCES just_me_inventory_items(id) ON DELETE CASCADE,
  movement_type             text        NOT NULL CHECK (movement_type IN ('receive', 'transfer', 'issue', 'return')),
  source_warehouse_id      uuid        REFERENCES just_me_warehouses(id) ON DELETE SET NULL,
  destination_warehouse_id uuid        REFERENCES just_me_warehouses(id) ON DELETE SET NULL,
  quantity                  numeric     NOT NULL CHECK (quantity > 0),
  reference_no              text,
  note                      text,
  created_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE just_me_stock_movements ENABLE ROW LEVEL SECURITY;

-- Select: Any org member can view movements
CREATE POLICY "just_me_stock_movements_select"
  ON just_me_stock_movements FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Write: Any org member can record movements
CREATE POLICY "just_me_stock_movements_write"
  ON just_me_stock_movements FOR ALL
  USING (is_org_member(org_id, auth.uid()))
  WITH CHECK (is_org_member(org_id, auth.uid()));


-- 6. Stock Movement Serials (Join Table for movement logs)
CREATE TABLE IF NOT EXISTS just_me_stock_movement_serials (
  movement_id uuid REFERENCES just_me_stock_movements(id) ON DELETE CASCADE,
  serial_id   uuid REFERENCES just_me_item_serials(id) ON DELETE CASCADE,
  PRIMARY KEY (movement_id, serial_id)
);

-- Enable RLS
ALTER TABLE just_me_stock_movement_serials ENABLE ROW LEVEL SECURITY;

-- Select: Any member can read
CREATE POLICY "just_me_stock_movement_serials_select"
  ON just_me_stock_movement_serials FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM just_me_stock_movements m 
    WHERE m.id = just_me_stock_movement_serials.movement_id 
    AND is_org_member(m.org_id, auth.uid())
  ));

-- Write: Any member can write
CREATE POLICY "just_me_stock_movement_serials_write"
  ON just_me_stock_movement_serials FOR ALL
  USING (EXISTS (
    SELECT 1 FROM just_me_stock_movements m 
    WHERE m.id = just_me_stock_movement_serials.movement_id 
    AND is_org_member(m.org_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM just_me_stock_movements m 
    WHERE m.id = just_me_stock_movement_serials.movement_id 
    AND is_org_member(m.org_id, auth.uid())
  ));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS just_me_warehouses_org_idx ON just_me_warehouses(org_id);
CREATE INDEX IF NOT EXISTS just_me_inventory_items_org_idx ON just_me_inventory_items(org_id);
CREATE INDEX IF NOT EXISTS just_me_stock_balances_warehouse_item_idx ON just_me_stock_balances(warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS just_me_item_serials_item_warehouse_idx ON just_me_item_serials(item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS just_me_stock_movements_org_item_idx ON just_me_stock_movements(org_id, item_id);
