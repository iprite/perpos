-- Issue Tracker P4b — close-the-loop: แจ้งผู้รายงาน (LINE) เมื่อปัญหาถูกปิด (deployed/closed)
-- คอลัมน์กัน double-notify · การ push อยู่ใน API PATCH (app code) ไม่ใช่ DB
alter table public.system_issues add column if not exists reporter_notified_at timestamptz;
