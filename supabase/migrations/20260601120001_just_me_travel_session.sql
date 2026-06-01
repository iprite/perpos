-- Extend clock sessions table to support travel state machine
-- States: idle (no session) | traveling (departed, en route) | working (at a location, active work)

-- Drop and recreate the status check constraint to include new states
ALTER TABLE just_me_clock_sessions
  DROP CONSTRAINT IF EXISTS just_me_clock_sessions_status_check;

ALTER TABLE just_me_clock_sessions
  ADD CONSTRAINT just_me_clock_sessions_status_check
  CHECK (status IN ('pending_in', 'pending_out', 'clocked_in', 'traveling', 'working'));

-- Last departure point (used to calculate hop distance on next arrival)
ALTER TABLE just_me_clock_sessions
  ADD COLUMN IF NOT EXISTS last_depart_time      timestamptz,
  ADD COLUMN IF NOT EXISTS last_depart_latitude  numeric(10,7),
  ADD COLUMN IF NOT EXISTS last_depart_longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS last_depart_address   text;
