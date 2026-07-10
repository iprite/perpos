-- ============================================================================
-- gov_procure — notify state (LINE cron anti-spam bookkeeping)
-- Created at: 2026-07-10
--
-- เพิ่มคอลัมน์เก็บสถานะการส่ง LINE ลงใน gov_procure_settings (1 row/org):
--   T1 (เงินค้างรับ, cron รายวัน 09:00) — re-alert เมื่อชุด overdue เปลี่ยน หรือครบทุก 3 วัน
--     * last_aging_alert_at  — เวลาส่งการ์ด T1 ล่าสุด
--     * last_aging_alert_key — signature ของชุดงาน overdue ล่าสุด (order_id เรียงแล้ว join)
--   T2 (รายงานพอร์ตรายสัปดาห์, cron จันทร์ 08:00) — กัน double-run
--     * last_weekly_sent_at  — เวลาส่งการ์ด T2 ล่าสุด
--
-- idempotent (ADD COLUMN IF NOT EXISTS) · server-managed ล้วน (ไม่อยู่ใน SETTINGS_WRITABLE)
-- ============================================================================

ALTER TABLE gov_procure_settings
  ADD COLUMN IF NOT EXISTS last_aging_alert_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_aging_alert_key  text,
  ADD COLUMN IF NOT EXISTS last_weekly_sent_at   timestamptz;
