-- Add branch type and branch number to contacts
-- branch_type: 'head_office' | 'branch' | 'unspecified'
-- branch_number: 5-digit string e.g. '00001', only meaningful when branch_type = 'branch'

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS branch_type   text NOT NULL DEFAULT 'unspecified'
    CHECK (branch_type IN ('head_office','branch','unspecified')),
  ADD COLUMN IF NOT EXISTS branch_number text
    CHECK (branch_number IS NULL OR branch_number ~ '^[0-9]{5}$');
