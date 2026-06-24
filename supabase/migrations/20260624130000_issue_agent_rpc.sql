-- Issue Tracker P2.1 — RPC ให้ agent (Fix Factory) เขียน issue แบบ parameterized
-- แทนการต่อ raw SQL + dollar-quote เอง (กัน escaping landmine เมื่อ root_cause/case_note มีโค้ด/$$)
-- ทั้งคู่ SECURITY DEFINER + service-role เท่านั้น (เหมือน next_issue_ref)

-- ── สร้าง issue ใหม่ (fresh symptom) → คืน ref ──────────────────────────────
create or replace function public.agent_create_issue(
  p_type      text,
  p_title     text,
  p_severity  text default 'sev2',
  p_symptom   text default null,
  p_reproduce text default null,
  p_area      text[] default '{}',
  p_status    text default 'triaging',
  p_actor     text default 'agent'
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
    raise exception 'invalid type: % (ต้องเป็น bug|config_infra|user_error|feature_gap)', p_type;
  end if;

  v_ref := public.next_issue_ref(v_prefix);

  insert into public.system_issues
    (ref, prefix, type, severity, status, title, symptom, reproduce, area, source)
  values
    (v_ref, v_prefix, p_type, p_severity, coalesce(p_status, 'triaging'),
     p_title, p_symptom, p_reproduce, coalesce(p_area, '{}'), 'agent')
  returning id into v_id;

  insert into public.system_issue_events (issue_id, actor, action, to_status, note)
  values (v_id, coalesce(p_actor, 'agent'), 'created', coalesce(p_status, 'triaging'),
          'สร้างโดย Fix Factory');

  return v_ref;
end;
$$;

-- ── อัปเดต issue ที่มีอยู่ (เปลี่ยนสถานะ / เขียนผล / โน้ต) — คืนสถานะใหม่ ────
-- param ที่เป็น null = ไม่แตะคอลัมน์นั้น (agent เขียนทับเฉพาะที่ส่งมา)
create or replace function public.agent_log_issue(
  p_ref         text,
  p_status      text default null,
  p_note        text default null,
  p_root_cause  text default null,
  p_fix_summary text default null,
  p_branch      text default null,
  p_files       text[] default null,
  p_case_note   text default null,
  p_actor       text default 'agent'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_from     text;
  v_resolved timestamptz;
  v_edited   boolean := false;
begin
  select id, status, resolved_at into v_id, v_from, v_resolved
  from public.system_issues where ref = p_ref;
  if v_id is null then
    raise exception 'issue not found: %', p_ref;
  end if;

  -- เขียน field ผล (เฉพาะที่ส่งมา)
  update public.system_issues set
    root_cause    = coalesce(p_root_cause, root_cause),
    fix_summary   = coalesce(p_fix_summary, fix_summary),
    branch        = coalesce(p_branch, branch),
    files_touched = coalesce(p_files, files_touched),
    case_note_md  = coalesce(p_case_note, case_note_md)
  where id = v_id;
  if (p_root_cause is not null or p_fix_summary is not null or p_branch is not null
      or p_files is not null or p_case_note is not null) then
    v_edited := true;
  end if;

  -- เปลี่ยนสถานะ + จัดการ resolved_at + event
  if p_status is not null and p_status <> v_from then
    update public.system_issues set
      status = p_status,
      resolved_at = case
        when p_status in ('fixed','deployed','closed') then coalesce(v_resolved, now())
        else null end
    where id = v_id;
    insert into public.system_issue_events (issue_id, actor, action, from_status, to_status, note)
    values (v_id, coalesce(p_actor,'agent'), 'status_change', v_from, p_status, p_note);
  elsif v_edited then
    insert into public.system_issue_events (issue_id, actor, action, note)
    values (v_id, coalesce(p_actor,'agent'), 'edited', coalesce(p_note, 'เขียนผลโดย agent'));
  elsif p_note is not null then
    insert into public.system_issue_events (issue_id, actor, action, note)
    values (v_id, coalesce(p_actor,'agent'), 'note', p_note);
  end if;

  return coalesce(p_status, v_from);
end;
$$;

-- lock down: service-role เท่านั้น
revoke all on function public.agent_create_issue(text,text,text,text,text,text[],text,text) from public, anon, authenticated;
revoke all on function public.agent_log_issue(text,text,text,text,text,text,text[],text,text) from public, anon, authenticated;
grant execute on function public.agent_create_issue(text,text,text,text,text,text[],text,text) to service_role;
grant execute on function public.agent_log_issue(text,text,text,text,text,text[],text,text) to service_role;
