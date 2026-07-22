-- gov_procure: คำสั่งจากกลุ่ม LINE ที่รอการยืนยัน (เรื่องเงินต้องกดยืนยันก่อนบันทึกเสมอ)
-- payload เก็บข้อมูลที่จะบันทึกจริงตอนกดยืนยัน · หมดอายุ 15 นาที · consumed_at กันกดซ้ำ
-- RLS: deny-all (ไม่มี policy) — เข้าถึงผ่าน service role ใน webhook เท่านั้น
create table if not exists public.gov_procure_line_pending (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  group_id     text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  kind         text not null check (kind in ('contribution','new_order')),
  payload      jsonb not null default '{}'::jsonb,
  expires_at   timestamptz not null default (now() + interval '15 minutes'),
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists gov_procure_line_pending_group_idx
  on public.gov_procure_line_pending (group_id, expires_at desc);

alter table public.gov_procure_line_pending enable row level security;
