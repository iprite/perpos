-- Travel reimbursement system for just-me module
-- Tracks multi-hop location stops throughout a workday and calculates fuel claims

-- 1. Per-stop location log (one row per GPS check-in event)
CREATE TABLE IF NOT EXISTS just_me_travel_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  work_date    date        NOT NULL,
  sequence     smallint    NOT NULL DEFAULT 0,   -- 0 = first stop, 1, 2, ...
  stop_type    text        NOT NULL CHECK (stop_type IN ('start', 'site', 'end')),
  timestamp    timestamptz NOT NULL DEFAULT now(),
  latitude     numeric(10,7) NOT NULL,
  longitude    numeric(10,7) NOT NULL,
  address      text,
  note         text,                             -- optional label e.g. "บริษัท ABC"
  clock_log_id uuid        REFERENCES just_me_clock_logs(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE just_me_travel_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "just_me_travel_logs_select"
  ON just_me_travel_logs FOR SELECT
  USING (
    is_org_admin(org_id, auth.uid())
    OR (profile_id = auth.uid() AND is_org_member(org_id, auth.uid()))
  );

CREATE POLICY "just_me_travel_logs_insert"
  ON just_me_travel_logs FOR INSERT
  WITH CHECK (
    profile_id = auth.uid() AND is_org_member(org_id, auth.uid())
  );

CREATE INDEX IF NOT EXISTS just_me_travel_logs_profile_date_idx
  ON just_me_travel_logs (org_id, profile_id, work_date, sequence);

-- 2. Org-level travel settings
CREATE TABLE IF NOT EXISTS just_me_travel_settings (
  org_id             uuid    PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  fuel_rate_per_km   numeric(6,2) NOT NULL DEFAULT 4.00,
  home_latitude      numeric(10,7),
  home_longitude     numeric(10,7),
  home_address       text,
  include_return     boolean NOT NULL DEFAULT true,  -- add return leg back to home
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE just_me_travel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "just_me_travel_settings_select"
  ON just_me_travel_settings FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "just_me_travel_settings_upsert"
  ON just_me_travel_settings FOR ALL
  USING (is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_org_admin(org_id, auth.uid()));

-- 3. Daily travel claims (one row per employee per work date)
CREATE TABLE IF NOT EXISTS just_me_travel_claims (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id        uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  work_date         date    NOT NULL,
  hops              jsonb   NOT NULL DEFAULT '[]',  -- [{from_address, to_address, distance_km}]
  total_distance_km numeric(8,2),
  fuel_rate_per_km  numeric(6,2),
  total_amount      numeric(10,2),
  status            text    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','paid','rejected')),
  note              text,
  approved_by       uuid    REFERENCES profiles(id),
  approved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, profile_id, work_date)
);

ALTER TABLE just_me_travel_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "just_me_travel_claims_select"
  ON just_me_travel_claims FOR SELECT
  USING (
    is_org_admin(org_id, auth.uid())
    OR (profile_id = auth.uid() AND is_org_member(org_id, auth.uid()))
  );

CREATE POLICY "just_me_travel_claims_insert"
  ON just_me_travel_claims FOR INSERT
  WITH CHECK (
    profile_id = auth.uid() AND is_org_member(org_id, auth.uid())
  );

CREATE POLICY "just_me_travel_claims_update"
  ON just_me_travel_claims FOR UPDATE
  USING (
    is_org_admin(org_id, auth.uid())
    OR profile_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS just_me_travel_claims_profile_date_idx
  ON just_me_travel_claims (org_id, profile_id, work_date DESC);
