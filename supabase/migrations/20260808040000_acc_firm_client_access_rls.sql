-- สำนักงานบัญชีอ่านข้อมูลบัญชีของ org ลูกค้าได้ผ่าน engagement (firm access)
--
-- ทำไมต้องมี: guard ฝั่งแอป (requireModuleMember / getModuleRoleForCurrentUser) ปล่อยให้
-- พนักงานสำนักงานเข้าหน้าบัญชีของลูกค้าได้แล้ว แต่ **การอ่านจริงวิ่งผ่าน RLS** (auth.rls ใน
-- API GET + createSupabaseServerClient ใน SSR) ซึ่ง policy เดิมคือ
-- `is_org_member(org_id, auth.uid())` — พนักงานสำนักงานไม่มีแถวใน organization_members
-- ของลูกค้า ⇒ ทุก list/รายงานคืน **[] เงียบ ๆ ไม่มี error** ขณะที่การเขียนวิ่ง service-role
-- จึงสำเร็จ ⇒ ลงบัญชีได้แต่มองไม่เห็นสิ่งที่ลงไป (สภาพที่อันตรายกว่าเข้าไม่ได้เลย)
--
-- ขอบเขต: เพิ่ม policy **SELECT อย่างเดียว** และ **เฉพาะตารางบัญชี (acc_* ที่คีย์ด้วย org_id)**
-- — ไม่แตะ is_org_member (ใช้ร่วมทั้งระบบ; แก้ตรงนั้น = สำนักงานเห็น CRM/HR/คลังของลูกค้าด้วย)
-- การเขียนยังเป็น service-role ผ่าน API ที่ผ่านด่าน role matrix ของ accounting เหมือนเดิม

-- ── helper ────────────────────────────────────────────────────────────────────
-- true เมื่อ uid เป็นสมาชิกโมดูล acc_firm ของสำนักงานที่ (1) ยังเปิดโมดูล acc_firm
-- (2) มี engagement `active` กับ client_org นี้ (3) engagement นั้นครอบ 'accounting'
-- และ (4) uid ไม่ได้ถูกถอนสิทธิ์รายบุคคลไว้ (module_members ของ org ลูกค้า is_active=false
-- = การถอนโดยเจตนาจาก /api/acc-firm/provision → ต้องชนะ engagement)
create or replace function public.acc_firm_has_client_access(p_client_org_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from acc_firm_clients c
    join module_members mm
      on mm.org_id = c.firm_org_id
     and mm.module_key = 'acc_firm'
     and mm.is_active
     and mm.user_id = p_uid
    join org_module_settings s
      on s.organization_id = c.firm_org_id
     and s.module_key = 'acc_firm'
     and s.is_enabled
    where c.client_org_id = p_client_org_id
      and c.status = 'active'
      and 'accounting' = any (c.modules_managed)
  )
  and not exists (
    select 1 from module_members rv
    where rv.org_id = p_client_org_id
      and rv.module_key = 'accounting'
      and rv.user_id = p_uid
      and rv.is_active = false
  );
$$;

revoke all on function public.acc_firm_has_client_access(uuid, uuid) from public;
grant execute on function public.acc_firm_has_client_access(uuid, uuid) to authenticated, service_role;

comment on function public.acc_firm_has_client_access(uuid, uuid) is
  'true = uid เข้าถึงข้อมูลบัญชีของ org ลูกค้ารายนี้ได้ในนามสำนักงานบัญชี (engagement active + modules_managed มี accounting + ไม่ถูกถอนสิทธิ์รายบุคคล) — ดู docs/ACC_FIRM_CLIENT_ACCESS.md';

-- ── policy: SELECT เพิ่มให้ตารางบัญชีที่คีย์ด้วย org_id ───────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'acc_account_roles', 'acc_accounts', 'acc_assets', 'acc_bank_accounts',
    'acc_contacts', 'acc_document_lines', 'acc_documents', 'acc_entries',
    'acc_journal_entries', 'acc_journal_lines', 'acc_org_settings',
    'acc_payment_allocations', 'acc_payments', 'acc_periods', 'acc_products',
    'acc_purchase_document_lines', 'acc_purchase_documents', 'acc_tax_filings'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'ข้ามตาราง % (ไม่มีในฐานนี้)', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_select_firm', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.acc_firm_has_client_access(org_id, auth.uid()))',
      t || '_select_firm', t
    );
  end loop;
end $$;
