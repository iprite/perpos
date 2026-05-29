-- Database migration for Clock In/Out system of just-me module
-- Created at: 2026-05-29

-- 1. Historical Clock Logs
CREATE TABLE IF NOT EXISTS just_me_clock_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          text        NOT NULL CHECK (type IN ('in', 'out')),
  timestamp     timestamptz NOT NULL DEFAULT now(),
  latitude      numeric,
  longitude     numeric,
  address       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE just_me_clock_logs ENABLE ROW LEVEL SECURITY;

-- Select policy: User can view their own logs, Admin/Owner can view all logs in the org
CREATE POLICY "just_me_clock_logs_select"
  ON just_me_clock_logs FOR SELECT
  USING (
    is_org_admin(org_id, auth.uid()) 
    OR (profile_id = auth.uid() AND is_org_member(org_id, auth.uid()))
  );

-- Insert policy: User can insert their own logs
CREATE POLICY "just_me_clock_logs_insert"
  ON just_me_clock_logs FOR INSERT
  WITH CHECK (
    profile_id = auth.uid() AND is_org_member(org_id, auth.uid())
  );

-- 2. Current Session Tracking
CREATE TABLE IF NOT EXISTS just_me_clock_sessions (
  profile_id        uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  org_id            uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status            text        NOT NULL CHECK (status IN ('pending_in', 'pending_out', 'clocked_in')),
  last_in_time      timestamptz,
  last_in_latitude  numeric,
  last_in_longitude numeric,
  last_in_address   text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE just_me_clock_sessions ENABLE ROW LEVEL SECURITY;

-- Select policy: User can view their own session
CREATE POLICY "just_me_clock_sessions_select"
  ON just_me_clock_sessions FOR SELECT
  USING (profile_id = auth.uid());

-- Insert/Update/Delete policy: User can manage their own session
CREATE POLICY "just_me_clock_sessions_all"
  ON just_me_clock_sessions FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS just_me_clock_logs_org_profile_idx ON just_me_clock_logs(org_id, profile_id);
CREATE INDEX IF NOT EXISTS just_me_clock_sessions_org_idx ON just_me_clock_sessions(org_id);
