-- Phase 2: crm_note_attachments + storage bucket

CREATE TABLE IF NOT EXISTS crm_note_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      uuid NOT NULL REFERENCES crm_solution_notes(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  solution_id  uuid NOT NULL REFERENCES crm_solutions(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  mime_type    text NOT NULL DEFAULT 'application/octet-stream',
  file_size    bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_note_attachments_note_id_idx     ON crm_note_attachments(note_id);
CREATE INDEX IF NOT EXISTS crm_note_attachments_solution_id_idx ON crm_note_attachments(solution_id);

ALTER TABLE crm_note_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_attachments_select" ON crm_note_attachments FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM module_members WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_attachments_insert" ON crm_note_attachments FOR INSERT
  WITH CHECK (
    org_id IN (SELECT org_id FROM module_members WHERE user_id = auth.uid() AND module_key = 'crm' AND is_active = true)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "crm_attachments_delete" ON crm_note_attachments FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('crm-attachments', 'crm-attachments', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS (app-level auth via requireCrmMember guards the metadata)
CREATE POLICY "crm_storage_select" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'crm-attachments');

CREATE POLICY "crm_storage_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'crm-attachments');

CREATE POLICY "crm_storage_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'crm-attachments');
