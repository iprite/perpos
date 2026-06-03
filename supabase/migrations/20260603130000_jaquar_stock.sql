-- Migration for Jaquar Stock Management
-- Created at: 2026-06-03

CREATE TABLE IF NOT EXISTS public.jaquar_inventory_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_code        text NOT NULL,
  description      text,
  location         text,
  amount_starting  numeric(18,6) NOT NULL DEFAULT 0,
  import_jaquar    numeric(18,6) NOT NULL DEFAULT 0,
  return_borrowed  numeric(18,6) NOT NULL DEFAULT 0,
  total_saleable   numeric(18,6) NOT NULL DEFAULT 0,
  created_by       uuid NOT NULL REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, item_code)
);

-- Enable Row Level Security
ALTER TABLE public.jaquar_inventory_items ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow members to view items
CREATE POLICY "jaquar_inventory_items_select"
  ON public.jaquar_inventory_items FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Write policy: Allow admins to modify items
CREATE POLICY "jaquar_inventory_items_write"
  ON public.jaquar_inventory_items FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS jaquar_inventory_items_org_id_idx ON public.jaquar_inventory_items(org_id);
CREATE INDEX IF NOT EXISTS jaquar_inventory_items_item_code_idx ON public.jaquar_inventory_items(org_id, item_code);


-- Create jaquar_inventory_movements table
CREATE TABLE IF NOT EXISTS public.jaquar_inventory_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id        uuid NOT NULL REFERENCES public.jaquar_inventory_items(id) ON DELETE CASCADE,
  movement_date  date NOT NULL,
  qty            numeric(18,6) NOT NULL,
  movement_type  text NOT NULL CHECK (movement_type IN ('in', 'out')),
  reference      text,
  created_by     uuid NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.jaquar_inventory_movements ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow members to view movements
CREATE POLICY "jaquar_inventory_movements_select"
  ON public.jaquar_inventory_movements FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- Write policy: Allow admins to modify movements
CREATE POLICY "jaquar_inventory_movements_write"
  ON public.jaquar_inventory_movements FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS jaquar_inventory_movements_item_id_idx ON public.jaquar_inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS jaquar_inventory_movements_org_id_idx ON public.jaquar_inventory_movements(org_id);
