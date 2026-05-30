ALTER TABLE module_registry
  ADD COLUMN IF NOT EXISTS menu_labels jsonb NOT NULL DEFAULT '{}';
