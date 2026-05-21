-- Add slug column to organizations table.
-- The slug is a URL-safe identifier used in the new /[org]/[module]/[menu] URL structure.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug text;

-- Auto-populate: kebab-case from ASCII chars in name, fallback to UUID prefix.
UPDATE organizations
SET slug = CASE
  WHEN REGEXP_REPLACE(LOWER(REPLACE(REPLACE(name, ' ', '-'), '.', '')), '[^a-z0-9-]', '', 'g') != ''
  THEN SUBSTRING(REGEXP_REPLACE(LOWER(REPLACE(REPLACE(name, ' ', '-'), '.', '')), '[^a-z0-9-]', '', 'g'), 1, 24)
  ELSE SUBSTRING(REPLACE(id::text, '-', ''), 1, 12)
END
WHERE slug IS NULL OR slug = '';

-- Remove any leading/trailing hyphens that may have been introduced
UPDATE organizations SET slug = TRIM(BOTH '-' FROM slug);

-- If slug is still empty after trimming, use UUID prefix
UPDATE organizations SET slug = SUBSTRING(REPLACE(id::text, '-', ''), 1, 12)
WHERE slug = '' OR slug IS NULL;

-- Ensure uniqueness: append suffix if slug already taken
-- (handles rare collisions on initial population)
DO $$
DECLARE
  r RECORD;
  base_slug text;
  candidate text;
  counter int;
BEGIN
  FOR r IN SELECT id, slug FROM organizations ORDER BY created_at LOOP
    base_slug := r.slug;
    candidate := base_slug;
    counter   := 2;
    WHILE EXISTS (
      SELECT 1 FROM organizations WHERE slug = candidate AND id != r.id
    ) LOOP
      candidate := base_slug || '-' || counter;
      counter   := counter + 1;
    END LOOP;
    IF candidate != r.slug THEN
      UPDATE organizations SET slug = candidate WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL;
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);

-- RLS: allow authenticated users to read all org slugs (needed for URL validation).
-- The existing organization_members RLS policies already scope data access.
CREATE POLICY IF NOT EXISTS "orgs_slug_read" ON organizations
  FOR SELECT TO authenticated USING (true);
