-- tmc_stays.booking_group_id — ผูกแถวที่มาจาก booking เดียวกัน (ลงหลายห้องพร้อมกัน = คนละแถวต่อห้อง)
-- ใช้เป็นหน่วยของ "แก้ทั้ง booking เป็นกลุ่ม" (เพิ่ม/ลดห้อง + หารค่าห้อง/มัดจำใหม่)
ALTER TABLE tmc_stays ADD COLUMN IF NOT EXISTS booking_group_id uuid;

-- แก้ข้อมูล typo เดือน (check_out 2026-05-07 < check_in 2026-06-06) — บล็อก UPDATE เพราะ CHECK constraint
UPDATE tmc_stays SET check_out = '2026-06-07' WHERE id = '5fb504a7-4bdc-4bd3-b54f-fdd94a870f27';

-- backfill: แถวที่สร้างพร้อมกัน (insert statement เดียว → created_at เท่ากัน) + guest/วันที่เดียวกัน = booking เดียวกัน
WITH grp AS (
  SELECT org_id, guest_id, check_in, check_out, created_at, gen_random_uuid() AS gid
  FROM tmc_stays
  GROUP BY org_id, guest_id, check_in, check_out, created_at
)
UPDATE tmc_stays s
SET booking_group_id = g.gid
FROM grp g
WHERE s.booking_group_id IS NULL
  AND s.org_id = g.org_id
  AND s.guest_id IS NOT DISTINCT FROM g.guest_id
  AND s.check_in = g.check_in
  AND s.check_out IS NOT DISTINCT FROM g.check_out
  AND s.created_at = g.created_at;

ALTER TABLE tmc_stays ALTER COLUMN booking_group_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tmc_stays_booking_group ON tmc_stays (booking_group_id);
