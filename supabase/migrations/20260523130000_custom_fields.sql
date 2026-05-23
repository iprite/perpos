-- ── Phase 2a: Custom Fields Manager ──────────────────────────────────────────
-- Allows super admin to add org-specific fields to standard entities.
-- Values are stored in a `custom_properties jsonb` column on each target table.
-- Definitions live in org_custom_fields (EAV-lite pattern).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_custom_fields (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key     text        NOT NULL,                  -- 'tmc', 'accounting', etc.
  entity_type    text        NOT NULL,                  -- 'finance_entry', 'customer', 'order'
  field_key      text        NOT NULL,                  -- snake_case identifier, e.g. 'license_plate'
  label_th       text        NOT NULL,                  -- "ทะเบียนรถ"
  label_en       text,                                  -- "License Plate"
  field_type     text        NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean')),
  select_options jsonb,                                 -- [{"value":"a","label":"A"}] for select type
  is_required    boolean     NOT NULL DEFAULT false,
  sort_order     int         NOT NULL DEFAULT 0,
  created_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, module_key, entity_type, field_key),
  -- Disallow reserved field keys that clash with real columns
  CONSTRAINT field_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT field_key_not_reserved CHECK (
    field_key NOT IN (
      'id', 'org_id', 'organization_id', 'created_at', 'updated_at',
      'created_by', 'updated_by', 'deleted_at', 'is_active'
    )
  )
);

CREATE INDEX IF NOT EXISTS org_custom_fields_org_entity_idx
  ON org_custom_fields (org_id, module_key, entity_type, sort_order);

-- Add custom_properties to tables that support custom fields
-- (IF EXISTS so this is safe to run even if table doesn't exist yet)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tmc_finance_entries') THEN
    ALTER TABLE tmc_finance_entries ADD COLUMN IF NOT EXISTS custom_properties jsonb NOT NULL DEFAULT '{}';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS custom_properties jsonb NOT NULL DEFAULT '{}';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_properties jsonb NOT NULL DEFAULT '{}';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_quotes') THEN
    ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS custom_properties jsonb NOT NULL DEFAULT '{}';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_invoices') THEN
    ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS custom_properties jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- RLS: org members can read their own fields; only service_role can write
ALTER TABLE org_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view custom fields"
  ON org_custom_fields FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON org_custom_fields FROM PUBLIC, anon, authenticated;
