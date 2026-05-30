-- PMS usvilla Phase 1 — Rooms, Bookings, Payments
-- Replaces stub usvilla_records table

DROP TABLE IF EXISTS usvilla_records CASCADE;

-- ==============================
-- Rooms (45 ห้อง: A/V/C x 16)
-- ==============================
CREATE TABLE IF NOT EXISTS pms_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  room_type   text NOT NULL CHECK (room_type IN ('A', 'V', 'C')),
  base_price  numeric(10,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'available'
              CHECK (status IN ('available', 'maintenance', 'inactive')),
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, room_number)
);

ALTER TABLE pms_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pms_rooms_select" ON pms_rooms FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "pms_rooms_write" ON pms_rooms FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS pms_rooms_org_idx  ON pms_rooms(org_id);
CREATE INDEX IF NOT EXISTS pms_rooms_type_idx ON pms_rooms(org_id, room_type);

-- ==============================
-- Bookings
-- ==============================
CREATE TABLE IF NOT EXISTS pms_bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  room_id        uuid NOT NULL REFERENCES pms_rooms(id),
  guest_name     text NOT NULL,
  nationality    text,
  stay_type      text NOT NULL DEFAULT 'daily'
                 CHECK (stay_type IN ('daily', 'hourly')),
  check_in_date  date NOT NULL,
  check_in_time  time,
  check_out_date date,
  check_out_time time,
  nights         int,
  status         text NOT NULL DEFAULT 'checked_in'
                 CHECK (status IN ('reserved', 'checked_in', 'checked_out', 'cancelled')),
  notes          text,
  created_by     uuid REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pms_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pms_bookings_select" ON pms_bookings FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "pms_bookings_write" ON pms_bookings FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS pms_bookings_org_idx    ON pms_bookings(org_id);
CREATE INDEX IF NOT EXISTS pms_bookings_room_idx   ON pms_bookings(room_id);
CREATE INDEX IF NOT EXISTS pms_bookings_date_idx   ON pms_bookings(org_id, check_in_date);
CREATE INDEX IF NOT EXISTS pms_bookings_status_idx ON pms_bookings(org_id, status);

-- ==============================
-- Payments (1 booking → หลาย method)
-- ==============================
CREATE TABLE IF NOT EXISTS pms_payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES pms_bookings(id) ON DELETE CASCADE,
  method     text NOT NULL
             CHECK (method IN ('cash','qr','credit_card','trip','agoda','expedia','wechat','alipay')),
  amount     numeric(10,2) NOT NULL CHECK (amount >= 0),
  paid_at    timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pms_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pms_payments_select" ON pms_payments FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "pms_payments_write" ON pms_payments FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS pms_payments_booking_idx ON pms_payments(booking_id);
CREATE INDEX IF NOT EXISTS pms_payments_org_idx     ON pms_payments(org_id, paid_at);

-- ==============================
-- Function: init 45 ห้องให้ org
-- ==============================
CREATE OR REPLACE FUNCTION init_pms_rooms(p_org_id uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  room_types text[] := ARRAY['A', 'V', 'C'];
  rtype      text;
  i          int;
  sort_i     int := 0;
  inserted   int := 0;
BEGIN
  FOREACH rtype IN ARRAY room_types LOOP
    FOR i IN 1..16 LOOP
      INSERT INTO pms_rooms (org_id, room_number, room_type, sort_order)
      VALUES (p_org_id, rtype || lpad(i::text, 3, '0'), rtype, sort_i)
      ON CONFLICT (org_id, room_number) DO NOTHING;
      IF FOUND THEN inserted := inserted + 1; END IF;
      sort_i := sort_i + 1;
    END LOOP;
  END LOOP;
  RETURN inserted;
END;
$$;
