-- Org-level invite tracking

CREATE TABLE IF NOT EXISTS org_invites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email            text NOT NULL,
  org_role         text NOT NULL DEFAULT 'member' CHECK (org_role IN ('owner','admin','member')),
  invited_user_id  uuid,
  invited_by       uuid NOT NULL DEFAULT auth.uid(),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (organization_id, email, status)
);

CREATE INDEX IF NOT EXISTS org_invites_org_idx   ON org_invites (organization_id);
CREATE INDEX IF NOT EXISTS org_invites_email_idx ON org_invites (email);

DROP POLICY IF EXISTS "org_member_all" ON org_invites;
CREATE POLICY "org_member_all" ON org_invites
  USING (
    EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = org_invites.organization_id
        AND m.user_id = auth.uid()
    )
  );

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
