-- Add work time tracking to travel claims
-- work_start = first site arrival, work_end = last site departure

ALTER TABLE just_me_travel_claims
  ADD COLUMN IF NOT EXISTS work_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS work_end_time   timestamptz,
  ADD COLUMN IF NOT EXISTS work_minutes    integer;

-- Add location_type to travel logs so we know home vs site
ALTER TABLE just_me_travel_logs
  ADD COLUMN IF NOT EXISTS location_type text CHECK (location_type IN ('home', 'site'));
