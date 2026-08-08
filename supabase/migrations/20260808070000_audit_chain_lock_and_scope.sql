-- แก้ 3 จุดของร่องรอยบัญชี (ผลจากรีวิว 20260808060000)
--
-- 1) DML verb ส่งเข้ามาได้ตรง ๆ (`p_dml`) — การลบที่ไม่ได้อ่านแถวเดิมมาก่อนจะไม่มีทั้ง
--    old/new ⇒ เดิมถูกเดาเป็น UPDATE ⇒ กรอง DELETE ที่ /admin/audit แล้วไม่เจอการลบเลย
-- 2) **โซ่ hash แตกเมื่อเขียนพร้อมกัน** — โซ่ผูกต่อกันต่อ table_name โดยอ่าน chain_hash
--    ล่าสุดแล้วต่อ แต่ไม่มีล็อก ⇒ สองงานพร้อมกันต่อจาก prev เดียวกัน = โซ่แตกถาวร
--    เครื่องมือตรวจจะฟ้อง "ถูกแก้ไข" ทั้งที่ไม่มีใครแก้
--    ⇒ ล็อก pg_advisory_xact_lock **ทั้ง log_audit_event() และ fn_audit_log_changes()**
--      ด้วยกุญแจดอกเดียวกัน — ล็อกฝั่งเดียวไม่ช่วย เพราะทั้งคู่เขียนสายโซ่ acc_* เดียวกัน
--      (ตาราง acc_* มี DML trigger ของ audit v2 อยู่แล้ว 16 ตัว)
-- 3) policy อ่านของสำนักงานบัญชีต้องจำกัดที่ตาราง `acc_*` — เดิมเปิดทุกตารางที่คีย์ด้วย
--    org_id ของลูกค้า (tmc_finance_entries / organization_members / profiles) ⇒ สำนักงาน
--    อ่าน old_data/new_data ของโมดูลอื่นได้ ขัดกับขอบเขต accounting-only ใน 20260808040000

-- ── 1+2. RPC: เพิ่ม p_dml + ล็อกสายโซ่ ────────────────────────────────────────
create or replace function public.log_audit_event(
  p_org_id             uuid,
  p_actor_id           uuid,
  p_action             text,
  p_table_name         text,
  p_record_id          uuid    default null,
  p_old_data           jsonb   default null,
  p_new_data           jsonb   default null,
  p_on_behalf_of_org_id uuid   default null,
  p_ip                 text    default null,
  p_ua                 text    default null,
  p_request_id         text    default null,
  p_dml                text    default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dml          text;
  v_diff_keys    text[];
  v_payload      jsonb;
  v_payload_hash text;
  v_prev_hash    text;
  v_chain_hash   text;
  v_id           uuid;
begin
  if p_action is null or p_table_name is null then
    raise exception 'log_audit_event: ต้องระบุ action และ table_name';
  end if;

  v_dml := upper(coalesce(p_dml, case
    when p_old_data is null and p_new_data is not null then 'INSERT'
    when p_new_data is null and p_old_data is not null then 'DELETE'
    else 'UPDATE'
  end));
  if v_dml not in ('INSERT', 'UPDATE', 'DELETE') then
    raise exception 'log_audit_event: dml ต้องเป็น INSERT/UPDATE/DELETE ไม่ใช่ %', v_dml;
  end if;

  if p_old_data is not null and p_new_data is not null then
    select array(
      select k from jsonb_object_keys(p_new_data) as k
      where p_new_data -> k is distinct from p_old_data -> k
    ) into v_diff_keys;
  elsif p_new_data is not null then
    v_diff_keys := array(select jsonb_object_keys(p_new_data));
  end if;

  v_payload := jsonb_build_object(
    'action',    p_action,
    'table',     p_table_name,
    'record_id', p_record_id::text,
    'old_data',  p_old_data,
    'new_data',  p_new_data,
    'logged_at', now()::text
  );
  v_payload_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  -- โซ่ผูกต่อกันต่อ table_name → ต้องอ่าน prev + เขียนใหม่แบบอะตอมมิก
  perform pg_advisory_xact_lock(hashtext('audit_chain:' || p_table_name));

  select chain_hash into v_prev_hash
  from audit_logs
  where table_name = p_table_name
  order by sequence_no desc
  limit 1;

  if v_prev_hash is null then
    v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
  end if;

  v_chain_hash := encode(extensions.digest(v_prev_hash || v_payload_hash, 'sha256'), 'hex');

  insert into audit_logs (
    org_id, actor_id, on_behalf_of_org_id, action, business_action, table_name, record_id,
    old_data, new_data, diff_keys, payload_hash, chain_hash,
    ip_address, user_agent, request_id, logged_at
  ) values (
    p_org_id, p_actor_id, p_on_behalf_of_org_id, v_dml, p_action, p_table_name, p_record_id,
    p_old_data, p_new_data, v_diff_keys, v_payload_hash, v_chain_hash,
    p_ip, p_ua, p_request_id, now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- overload เดิม (11 พารามิเตอร์) ต้องทิ้ง ไม่งั้นเรียกแล้วกำกวม
drop function if exists public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb, uuid, text, text, text);

revoke all on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb, uuid, text, text, text, text) from public;
grant execute on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb, uuid, text, text, text, text) to service_role;

-- ── 2. trigger ของ audit v2 ต้องล็อกสายโซ่ด้วยกุญแจเดียวกัน ─────────────────
-- (เหมือนเดิมทุกอย่าง เพิ่มเฉพาะบรรทัด pg_advisory_xact_lock ก่อนอ่าน prev hash)
create or replace function fn_audit_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id     uuid;
  v_org_id       uuid;
  v_ip           text;
  v_ua           text;
  v_req_id       text;
  v_old_data     jsonb;
  v_new_data     jsonb;
  v_diff_keys    text[];
  v_record_id    uuid;
  v_payload      jsonb;
  v_payload_hash text;
  v_prev_hash    text;
  v_chain_hash   text;
  v_setting      text;
begin
  begin
    v_setting := current_setting('audit.actor_id', true);
    if v_setting is not null and v_setting <> '' then v_actor_id := v_setting::uuid; end if;
  exception when others then v_actor_id := null;
  end;

  begin
    v_setting := current_setting('audit.org_id', true);
    if v_setting is not null and v_setting <> '' then v_org_id := v_setting::uuid; end if;
  exception when others then v_org_id := null;
  end;

  v_ip     := nullif(current_setting('audit.ip_address', true), '');
  v_ua     := nullif(current_setting('audit.user_agent',  true), '');
  v_req_id := nullif(current_setting('audit.request_id',  true), '');

  case TG_OP
    when 'INSERT' then
      v_new_data  := row_to_json(NEW)::jsonb;
      v_old_data  := null;
      v_diff_keys := array(select jsonb_object_keys(v_new_data));
      begin v_record_id := (v_new_data->>'id')::uuid; exception when others then v_record_id := null; end;
    when 'UPDATE' then
      v_new_data  := row_to_json(NEW)::jsonb;
      v_old_data  := row_to_json(OLD)::jsonb;
      select array(
        select k from jsonb_object_keys(v_new_data) as k
        where v_new_data->k is distinct from v_old_data->k
      ) into v_diff_keys;
      begin v_record_id := (v_new_data->>'id')::uuid; exception when others then v_record_id := null; end;
    when 'DELETE' then
      v_old_data  := row_to_json(OLD)::jsonb;
      v_new_data  := null;
      v_diff_keys := null;
      begin v_record_id := (v_old_data->>'id')::uuid; exception when others then v_record_id := null; end;
  end case;

  if v_actor_id is null then
    begin
      if v_new_data is not null then
        if (v_new_data->>'created_by') is not null then
          v_actor_id := (v_new_data->>'created_by')::uuid;
        elsif (v_new_data->>'user_id') is not null then
          v_actor_id := (v_new_data->>'user_id')::uuid;
        end if;
      end if;
    exception when others then null;
    end;
  end if;

  if v_org_id is null then
    begin
      if v_new_data is not null and (v_new_data->>'org_id') is not null then
        v_org_id := (v_new_data->>'org_id')::uuid;
      elsif v_old_data is not null and (v_old_data->>'org_id') is not null then
        v_org_id := (v_old_data->>'org_id')::uuid;
      end if;
    exception when others then null;
    end;
  end if;

  v_payload := jsonb_build_object(
    'action',    TG_OP,
    'table',     TG_TABLE_NAME,
    'record_id', v_record_id::text,
    'old_data',  v_old_data,
    'new_data',  v_new_data,
    'logged_at', now()::text
  );
  v_payload_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  -- กุญแจดอกเดียวกับ log_audit_event() — กันโซ่แตกจากการเขียนพร้อมกัน
  perform pg_advisory_xact_lock(hashtext('audit_chain:' || TG_TABLE_NAME));

  select chain_hash into v_prev_hash
  from   audit_logs
  where  table_name = TG_TABLE_NAME
  order  by sequence_no desc
  limit  1;

  if v_prev_hash is null then
    v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
  end if;

  v_chain_hash := encode(extensions.digest(v_prev_hash || v_payload_hash, 'sha256'), 'hex');

  insert into audit_logs (
    org_id, actor_id, action, table_name, record_id,
    old_data, new_data, diff_keys, payload_hash, chain_hash,
    ip_address, user_agent, request_id, logged_at
  ) values (
    v_org_id, v_actor_id, TG_OP, TG_TABLE_NAME, v_record_id,
    v_old_data, v_new_data, v_diff_keys, v_payload_hash, v_chain_hash,
    v_ip, v_ua, v_req_id, now()
  );

  perform set_config('audit.actor_id',   '', false);
  perform set_config('audit.org_id',     '', false);
  perform set_config('audit.ip_address', '', false);
  perform set_config('audit.user_agent', '', false);
  perform set_config('audit.request_id', '', false);

  return null;
end;
$$;

-- ── 3. ขอบเขตการอ่านของสำนักงานบัญชี = ตาราง acc_* เท่านั้น ──────────────────
drop policy if exists audit_logs_select_firm on audit_logs;
create policy audit_logs_select_firm on audit_logs
  for select to authenticated
  using (
    org_id is not null
    and table_name like 'acc\_%'
    and public.acc_firm_has_client_access(org_id, auth.uid())
  );
