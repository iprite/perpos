-- Personal Module support
-- 1. Add is_personal flag to module_registry
ALTER TABLE module_registry
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

-- 2. Mark assistant as a personal module (user-level, not org-level)
UPDATE module_registry SET is_personal = true WHERE key = 'assistant';

-- 3. personal_module_grants — super admin grants personal modules to specific users
CREATE TABLE IF NOT EXISTS personal_module_grants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  text        NOT NULL REFERENCES module_registry(key) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  is_enabled  boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, user_id)
);

ALTER TABLE personal_module_grants ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all grants
CREATE POLICY "personal_grants_admin"
  ON personal_module_grants FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- User can read their own enabled grants
CREATE POLICY "personal_grants_self_read"
  ON personal_module_grants FOR SELECT
  USING (user_id = auth.uid() AND is_enabled = true);

CREATE INDEX IF NOT EXISTS personal_module_grants_user_idx ON personal_module_grants(user_id);
CREATE INDEX IF NOT EXISTS personal_module_grants_module_idx ON personal_module_grants(module_key);
