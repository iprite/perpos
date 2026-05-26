-- CRM Solution Notes — activity/comment log per solution
CREATE TABLE IF NOT EXISTS crm_solution_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id uuid NOT NULL REFERENCES crm_solutions(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content     text NOT NULL,
  note_type   text NOT NULL DEFAULT 'note'
                CHECK (note_type IN ('note','call','meeting','email','status_change')),
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_solution_notes_solution_id_idx ON crm_solution_notes(solution_id);
CREATE INDEX IF NOT EXISTS crm_solution_notes_org_id_idx      ON crm_solution_notes(org_id);

ALTER TABLE crm_solution_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_notes_select" ON crm_solution_notes FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_notes_insert" ON crm_solution_notes FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM module_members
      WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_notes_delete" ON crm_solution_notes FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
