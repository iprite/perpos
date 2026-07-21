-- Issue Tracker P3 — LINE ingest: ผู้ใช้แจ้งปัญหาผ่าน LINE → สร้าง issue (source=line)
-- ขยาย agent_create_issue (+reported_by, reporter_note, dedup_key) + rate-limit table/RPC

-- ── ขยาย agent_create_issue (drop เก่า 8-param แล้วสร้างใหม่ 11-param) ────────
drop function if exists public.agent_create_issue(text,text,text,text,text,text[],text,text);

create or replace function public.agent_create_issue(
  p_type        text,
  p_title       text,
  p_severity    text default 'sev2',
  p_symptom     text default null,
  p_reproduce   text default null,
  p_area        text[] default '{}',
  p_status      text default 'triaging',
  p_actor       text default 'agent',
  p_reported_by uuid default null,        -- profile ผู้แจ้ง (LINE) — null = agent
  p_reporter_note text default null,      -- หมายเหตุผู้แจ้ง
  p_dedup_key   text default null         -- กันสร้างซ้ำ (เช่น line:<messageId>)
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_ref    text;
  v_id     uuid;
begin
  v_prefix := case p_type
    when 'bug' then 'BUG'
    when 'config_infra' then 'OPS'
    when 'user_error' then 'UX'
    when 'feature_gap' then 'FEAT'
    else null end;
  if v_prefix is null then
    raise exception 'invalid type: % (bug|config_infra|user_error|feature_gap)', p_type;
  end if;

  v_ref := public.next_issue_ref(v_prefix);

  insert into public.system_issues
    (ref, prefix, type, severity, status, title, symptom, reproduce, area,
     source, reported_by, reporter_note, dedup_key)
  values
    (v_ref, v_prefix, p_type, p_severity, coalesce(p_status, 'triaging'),
     p_title, p_symptom, p_reproduce, coalesce(p_area, '{}'),
     case when p_reported_by is not null then 'line' else 'agent' end,
     p_reported_by, p_reporter_note, p_dedup_key)
  returning id into v_id;

  insert into public.system_issue_events (issue_id, actor, action, to_status, note)
  values (v_id, coalesce(p_actor, 'agent'), 'created', coalesce(p_status, 'triaging'),
          coalesce(p_reporter_note, 'สร้างโดย Fix Factory'));

  return v_ref;
end;
$$;

revoke all on function public.agent_create_issue(text,text,text,text,text,text[],text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.agent_create_issue(text,text,text,text,text,text[],text,text,uuid,text,text) to service_role;

-- ── rate-limit แจ้งปัญหา (แนวเดียวกับ flow_chat_usage) ───────────────────────
create table if not exists public.issue_report_usage (
  line_user_id text not null,
  day          date not null default current_date,
  count        int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (line_user_id, day)
);
alter table public.issue_report_usage enable row level security;

-- RPC: +1 ต่อวัน คืน true ถ้ายังไม่เกิน limit (atomic)
create or replace function public.incr_issue_report_usage(p_line_user_id text, p_daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  insert into public.issue_report_usage (line_user_id, day, count)
  values (p_line_user_id, current_date, 1)
  on conflict (line_user_id, day)
  do update set count = public.issue_report_usage.count + 1, updated_at = now()
  returning count into v_count;
  return v_count <= p_daily_limit;
end;
$$;

revoke all on function public.incr_issue_report_usage(text, int) from public, anon, authenticated;
grant execute on function public.incr_issue_report_usage(text, int) to service_role;
