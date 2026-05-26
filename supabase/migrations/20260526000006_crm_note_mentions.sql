-- Phase 4: @mentions in notes

CREATE TABLE IF NOT EXISTS crm_note_mentions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id           uuid NOT NULL REFERENCES crm_solution_notes(id) ON DELETE CASCADE,
  solution_id       uuid NOT NULL REFERENCES crm_solutions(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS crm_note_mentions_note_id_idx ON crm_note_mentions(note_id);
CREATE INDEX IF NOT EXISTS crm_note_mentions_user_idx    ON crm_note_mentions(mentioned_user_id);

ALTER TABLE crm_note_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_mentions_select" ON crm_note_mentions FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_mentions_insert" ON crm_note_mentions FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
