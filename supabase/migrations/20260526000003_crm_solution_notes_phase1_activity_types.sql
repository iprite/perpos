-- Phase 1: expand activity types + time tracking fields

-- Migrate old types before dropping constraint
UPDATE crm_solution_notes SET note_type = 'meeting'    WHERE note_type IN ('call', 'email');
UPDATE crm_solution_notes SET note_type = 'system_log' WHERE note_type = 'status_change';

-- Drop old CHECK constraint
ALTER TABLE crm_solution_notes
  DROP CONSTRAINT IF EXISTS crm_solution_notes_note_type_check;

-- Add new CHECK with expanded types
ALTER TABLE crm_solution_notes
  ADD CONSTRAINT crm_solution_notes_note_type_check
  CHECK (note_type IN ('note','meeting','site_survey','issue','system_log','internal'));

-- Add time tracking + visibility columns
ALTER TABLE crm_solution_notes
  ADD COLUMN IF NOT EXISTS duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  ADD COLUMN IF NOT EXISTS is_billable      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_internal      boolean NOT NULL DEFAULT false;

-- Index for filtering
CREATE INDEX IF NOT EXISTS crm_solution_notes_type_idx ON crm_solution_notes(note_type);
