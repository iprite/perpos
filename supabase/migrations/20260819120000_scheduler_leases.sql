-- Lease กันรันซ้อนของ scheduler (worker process ใน compose + HTTP สำรอง + กันเผลอรัน worker 2 ตัว)
-- ใช้แถวใน DB แทน pg_advisory_lock เพราะ Supabase JS ผ่าน pooler ถือ session lock ข้าม request ไม่ได้
create table if not exists public.scheduler_leases (
  name        text primary key,
  owner       text not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.scheduler_leases enable row level security;
revoke all on public.scheduler_leases from anon, authenticated;

-- คืน true = ได้ lease (แถวใหม่ / หมดอายุแล้วแย่งได้ / เจ้าของเดิมต่ออายุ) · false = คนอื่นถืออยู่
-- INSERT ... ON CONFLICT DO UPDATE ล็อกแถวให้ ⇒ 2 ตัวขอพร้อมกันได้ true แค่ตัวเดียว
create or replace function public.scheduler_acquire_lease(p_name text, p_owner text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  insert into public.scheduler_leases (name, owner, acquired_at, expires_at)
  values (p_name, p_owner, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (name) do update
    set owner = excluded.owner, acquired_at = now(), expires_at = excluded.expires_at
    where public.scheduler_leases.expires_at < now() or public.scheduler_leases.owner = p_owner
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.scheduler_release_lease(p_name text, p_owner text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scheduler_leases where name = p_name and owner = p_owner;
$$;

revoke all on function public.scheduler_acquire_lease(text, text, int) from public, anon, authenticated;
revoke all on function public.scheduler_release_lease(text, text) from public, anon, authenticated;
grant execute on function public.scheduler_acquire_lease(text, text, int) to service_role;
grant execute on function public.scheduler_release_lease(text, text) to service_role;
