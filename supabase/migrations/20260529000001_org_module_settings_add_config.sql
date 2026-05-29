ALTER TABLE org_module_settings ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';
