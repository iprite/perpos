-- ร่องรอยการแก้ไขบัญชี (accounting audit trail) — ต่อยอดบน audit_logs v2 (hash chain)
--
-- ทำไมต้องมี: ตาราง acc_* มี DML trigger (audit v2) อยู่แล้วจึงรู้ว่า "เปลี่ยนอะไร" แต่
-- **ไม่รู้ว่าใครทำ** — actor มาจาก created_by ของแถวเท่านั้น จึงว่างเป็นส่วนใหญ่
-- (ของจริงในฐาน: acc_periods INSERT 120/120 ไม่มี actor · ทุกแถว DELETE ไม่มี actor)
-- และไม่มีทางรู้ว่า "ทำในนามสำนักงานบัญชีใด" หลังเปิด firm access
-- (docs/ACC_FIRM_CLIENT_ACCESS.md) ⇒ เพิ่มชั้น "ร่องรอยเชิงธุรกิจ" ที่ actor/firm ครบเสมอ
--
-- ทำไมไม่ใช้ session GUC (`set_audit_context`) ที่ trigger v2 ใช้:
--   PostgREST คุยกับ DB ผ่าน **connection pool** และ set_config(..., false) ผูกกับ *session*
--   ⇒ ถ้า request A ตั้ง context แล้วการเขียนล้มเหลว/ไม่เกิด GUC จะค้างบน connection นั้น
--   แล้ว request B (คนละคน) ที่ได้ connection เดิมจะถูกบันทึกเป็น actor ของ A
--   — "บันทึกผิดคน" ในสมุดร่องรอยแย่กว่า "ไม่รู้ว่าใคร" ⇒ ที่นี่ส่ง actor/firm เข้ามาตรง ๆ
--   ผ่าน RPC ไม่มี ambient state จึงไม่มีทางสลับคนกัน

-- ── 1. บริบท "ทำในนามใคร" ─────────────────────────────────────────────────────
alter table audit_logs add column if not exists on_behalf_of_org_id uuid references organizations(id);
-- ชื่อการกระทำเชิงธุรกิจ — `action` ถูก CHECK ไว้ที่ INSERT/UPDATE/DELETE (audit v2) และมี
-- consumer เดิมอยู่ (หน้า /admin/audit, ตัวส่งขึ้น Axiom) จึงไม่คลายกฎนั้น แต่เพิ่มคอลัมน์แทน
alter table audit_logs add column if not exists business_action text;

comment on column audit_logs.business_action is
  'ชื่อการกระทำเชิงธุรกิจ เช่น journal.post / document.void / period.close — null = แถวที่มาจาก DML trigger (audit v2)';

comment on column audit_logs.on_behalf_of_org_id is
  'ไม่ null = actor ลงมือ "ในนาม" องค์กรนี้ (สำนักงานบัญชีที่มี engagement กับ org_id) — ดู docs/ACC_FIRM_CLIENT_ACCESS.md';

create index if not exists audit_logs_org_logged_idx on audit_logs (org_id, logged_at desc);
create index if not exists audit_logs_business_action_idx on audit_logs (business_action, logged_at desc)
  where business_action is not null;
create index if not exists audit_logs_on_behalf_idx on audit_logs (on_behalf_of_org_id, logged_at desc)
  where on_behalf_of_org_id is not null;

-- ── 2. append-only ────────────────────────────────────────────────────────────
-- สมุดร่องรอยที่ลบ/แก้ย้อนหลังได้ = ไม่ใช่หลักฐาน · ถอนสิทธิ์แก้/ลบจาก service_role ด้วย
-- (ท่าเดียวกับ acc_firm_vault_audit — invariant I5 ของคลังเอกสาร)
revoke update, delete, truncate on audit_logs from service_role, authenticated, anon;

-- ── 3. RPC เขียนร่องรอย 1 แถว ─────────────────────────────────────────────────
-- คำนวณ payload_hash + chain_hash ด้วยสูตรเดียวกับ fn_audit_log_changes() เป๊ะ
-- (โซ่ผูกต่อกันต่อ table_name) เพื่อให้เครื่องมือตรวจโซ่เดิมตรวจแถวเหล่านี้ได้ด้วย
-- ⚠️ ต้อง pg_advisory_xact_lock ด้วยกุญแจเดียวกับ trigger — สองทางเขียนสายโซ่เดียวกัน
--    ถ้าล็อกฝั่งเดียวโซ่ยังแตกได้ (ดู migration 20260808070000)
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
  p_request_id         text    default null
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

  -- audit_logs.action ถูกจำกัดไว้ที่ DML verb → เดาจากข้อมูลที่ส่งมา
  -- ส่วนชื่อเชิงธุรกิจเก็บใน business_action
  v_dml := case
    when p_old_data is null and p_new_data is not null then 'INSERT'
    when p_new_data is null and p_old_data is not null then 'DELETE'
    else 'UPDATE'
  end;

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

revoke all on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb, uuid, text, text, text) from public;
grant execute on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb, uuid, text, text, text) to service_role;

comment on function public.log_audit_event is
  'เขียนร่องรอย 1 แถวเข้า audit_logs พร้อมต่อ hash chain — service-role เท่านั้น · actor/firm ส่งเข้ามาตรง ๆ ไม่พึ่ง session GUC (กันบันทึกผิดคนบน connection pool)';

-- ── 4. สำนักงานบัญชีอ่านร่องรอยของลูกค้าที่ตัวเองดูแลได้ ─────────────────────
-- (ลูกค้า/สมาชิก org อ่านของตัวเองยังไม่เปิดในเฟสนี้ — ยังไม่มีหน้าให้ดู)
drop policy if exists audit_logs_select_firm on audit_logs;
create policy audit_logs_select_firm on audit_logs
  for select to authenticated
  using (org_id is not null and public.acc_firm_has_client_access(org_id, auth.uid()));
