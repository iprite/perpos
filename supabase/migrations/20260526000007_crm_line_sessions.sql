-- Phase C: LINE time-tracking sessions

CREATE TABLE IF NOT EXISTS crm_line_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text        NOT NULL,
  profile_id   uuid        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  solution_id  uuid        NOT NULL REFERENCES crm_solutions(id) ON DELETE CASCADE,
  org_id       uuid        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  started_at   timestamptz NOT NULL DEFAULT now(),
  -- one active session per LINE user at a time
  UNIQUE (line_user_id)
);

CREATE INDEX IF NOT EXISTS crm_line_sessions_profile_idx ON crm_line_sessions(profile_id);

-- No RLS needed — accessed exclusively via service-role in API routes
