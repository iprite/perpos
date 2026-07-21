-- Demo/contact lead capture จากหน้า landing (ปุ่ม "ขอเดโม Suite")
-- เก็บ lead ที่กรอกฟอร์ม → แจ้ง super_admin ทาง LINE + ดูย้อนหลังที่ /admin/leads
-- เขียน/อ่านผ่าน service role เท่านั้น (RLS deny-all)

create table if not exists public.demo_requests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text not null,
  product      text not null default 'suite',   -- suite | flow
  source       text not null default 'landing', -- หน้า/ที่มาของ lead
  note         text,
  status       text not null default 'new'
                 check (status in ('new','contacted','qualified','won','lost','spam')),
  user_agent   text,
  created_at   timestamptz not null default now(),
  contacted_at timestamptz
);

create index if not exists demo_requests_created_idx on public.demo_requests (created_at desc);
create index if not exists demo_requests_status_idx  on public.demo_requests (status);

-- RLS: deny-all (ไม่มี policy) → เฉพาะ service role (admin client) ที่ bypass ได้
alter table public.demo_requests enable row level security;

comment on table public.demo_requests is 'Lead ขอเดโม/ติดต่อจากหน้า landing — เขียนผ่าน /api/public/demo-request, อ่านที่ /admin/leads (service role เท่านั้น)';
