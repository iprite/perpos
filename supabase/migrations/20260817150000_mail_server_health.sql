-- สถานะเฝ้าระวังเมลเซิร์ฟเวอร์ (Stalwart) — แถวเดียวต่อเครื่อง
-- เขียนโดย: (1) heartbeat จากเครื่องเมลผ่าน /api/admin/mail-server/heartbeat (worker secret)
--          (2) scheduler ที่ตรวจ 25/443/cert จากข้างนอกทุก 5 นาที + เก็บ alert state (กัน spam LINE)
-- อ่านโดย service role เท่านั้น — RLS enable โดยไม่มี policy = deny-all
create table if not exists mail_server_health (
  id text primary key,
  heartbeat jsonb,
  heartbeat_at timestamptz,
  alert_state jsonb not null default '{}'::jsonb,
  last_issues jsonb not null default '{}'::jsonb,
  last_check_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table mail_server_health enable row level security;
