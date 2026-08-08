-- รายการร่องรอยการแก้บัญชีของลูกค้า สำหรับหน้า /[firmSlug]/acc-firm/audit
--
-- ทำไมต้องเป็น RPC ไม่ใช่ select ตรงผ่าน RLS: หน้านี้ต้องโชว์ "ชื่อคนที่ทำ" แต่ `profiles`
-- อ่านได้เฉพาะแถวตัวเอง (policy profiles_select_own) ⇒ join ผ่าน RLS จะได้ null ทุกแถว
-- การไปคลาย policy ของ profiles เพื่อหน้านี้หน้าเดียวคือเปิดกว้างเกินจำเป็น
-- ⇒ ห่อไว้ใน SECURITY DEFINER ที่ **บังคับขอบเขตเองด้วย acc_firm_has_client_access()**
--    (กติกาเดียวกับ policy audit_logs_select_firm) แล้วคืนเฉพาะชื่อที่จำเป็น
create or replace function public.acc_firm_audit_list(
  p_client_org_id uuid        default null,
  p_from          timestamptz default null,
  p_to            timestamptz default null,
  p_only_business boolean     default false,
  p_limit         int         default 50,
  p_offset        int         default 0
) returns table (
  id                  uuid,
  logged_at           timestamptz,
  org_id              uuid,
  client_name         text,
  client_slug         text,
  action              text,
  business_action     text,
  table_name          text,
  record_id           uuid,
  actor_id            uuid,
  actor_name          text,
  on_behalf_of_org_id uuid,
  diff_keys           text[],
  total_count         bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.logged_at, a.org_id,
    o.name::text, o.slug::text,
    a.action, a.business_action, a.table_name, a.record_id,
    a.actor_id,
    coalesce(nullif(p.display_name, ''), split_part(p.email, '@', 1))::text as actor_name,
    a.on_behalf_of_org_id, a.diff_keys,
    count(*) over () as total_count
  from audit_logs a
  join organizations o on o.id = a.org_id
  left join profiles p on p.id = a.actor_id
  where a.org_id is not null
    and a.table_name like 'acc\_%'
    -- ขอบเขตเดียวกับ policy audit_logs_select_firm — ผู้เรียกเห็นได้เฉพาะลูกค้าที่ตัวเองดูแล
    and public.acc_firm_has_client_access(a.org_id, auth.uid())
    and (p_client_org_id is null or a.org_id = p_client_org_id)
    and (p_from is null or a.logged_at >= p_from)
    and (p_to   is null or a.logged_at <  p_to)
    and (not p_only_business or a.business_action is not null)
  order by a.logged_at desc, a.sequence_no desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.acc_firm_audit_list(uuid, timestamptz, timestamptz, boolean, int, int) from public;
grant execute on function public.acc_firm_audit_list(uuid, timestamptz, timestamptz, boolean, int, int) to authenticated, service_role;

comment on function public.acc_firm_audit_list is
  'ร่องรอยการแก้บัญชีของลูกค้าที่สำนักงานผู้เรียกดูแลอยู่ — บังคับขอบเขตด้วย acc_firm_has_client_access() ในตัว (ผู้เรียกอื่นได้ 0 แถว) · total_count = ยอดทั้งหมดที่ตรงเงื่อนไข';
