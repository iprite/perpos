-- scheduler_tier_runs — เก็บเวลา last-run ต่อ "tier" ของ scheduler
-- ใช้ gate งาน cleanup/sweep ที่ไม่ต้องทำทุกนาที (ลด Active CPU บน Vercel Fluid)
-- robust กับทุก cron cadence (1/2/5 นาที) เพราะ gate ด้วย elapsed time ไม่ใช่ minute-modulo
-- service-role เท่านั้น (scheduler ใช้ admin client) → RLS deny-all

create table if not exists public.scheduler_tier_runs (
  tier        text primary key,           -- 't5' | 't15' | 't60'
  last_run_at timestamptz not null default now()
);

alter table public.scheduler_tier_runs enable row level security;
-- ไม่มี policy = deny-all สำหรับ anon/authenticated · admin (service-role) bypass RLS

comment on table public.scheduler_tier_runs is
  'last-run ต่อ tier ของ /api/assistant/scheduler — gate งาน cleanup/sweep ให้รันห่างขึ้น (ลด CPU)';
