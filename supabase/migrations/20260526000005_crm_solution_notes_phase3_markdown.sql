-- Phase 3: markdown content format support

ALTER TABLE crm_solution_notes
  ADD COLUMN IF NOT EXISTS content_format text NOT NULL DEFAULT 'plain'
    CHECK (content_format IN ('plain', 'markdown'));

CREATE INDEX IF NOT EXISTS crm_solution_notes_format_idx ON crm_solution_notes(content_format);
