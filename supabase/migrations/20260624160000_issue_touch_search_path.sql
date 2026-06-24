-- Issue Tracker — ปิดช่องโหว่ search_path ของ trigger function
-- touch_system_issues_updated_at เดิมไม่ได้ตั้ง `set search_path` (ต่างจาก RPC อื่นในชุดเดียวกัน)
-- → Supabase advisor เตือน function_search_path_mutable (เสี่ยง schema-poisoning)
-- แก้แบบ idempotent ด้วย CREATE OR REPLACE (เพิ่ม set search_path = public) — ไม่แตะ trigger เดิม

create or replace function public.touch_system_issues_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
