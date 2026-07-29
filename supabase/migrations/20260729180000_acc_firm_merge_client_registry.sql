-- acc_firm — รวมทะเบียนลูกค้าเป็นตารางเดียว
--
-- เดิมมี 2 ที่: `acc_firm_service_clients` (ทะเบียนลูกค้าจริงของสำนักงาน — ค่าบริการ/งานที่รับ/
-- เจ้าของเอกสารใน vault) กับ `acc_firm_clients` (engagement = ลูกค้าที่ "มี org ใน PERPOS"
-- และสำนักงานเข้าไปดูสมุดบัญชีให้ได้) → ผู้ใช้ต้องกรอกลูกค้าคนเดียวกันสองที่
--
-- หลังจากนี้:
--   `acc_firm_service_clients` = ทะเบียนลูกค้า **ตัวหลักตัวเดียว** (client_org_id nullable)
--   `acc_firm_clients`         = "การเชื่อมระบบ" ของลูกค้าในทะเบียน (ผูกกันด้วย client_org_id)
--                                คงไว้เพราะ OCR / ตรวจปิดงวด / รายงานรวม / storage policy
--                                join ด้วย client_org_id อยู่แล้ว — ไม่ต้อง repoint FK ใด ๆ
--
-- invariant ใหม่: engagement ทุกแถวต้องมีแถวในทะเบียนที่ client_org_id ตรงกัน
-- (API POST /api/acc-firm/clients บังคับให้สร้างจากแถวทะเบียนเท่านั้น)

-- 1) ลูกค้าหนึ่ง org ผูกได้กับทะเบียนแถวเดียวต่อสำนักงาน
create unique index if not exists acc_firm_service_clients_firm_client_org_key
  on acc_firm_service_clients (firm_org_id, client_org_id)
  where client_org_id is not null;

-- 2) backfill — engagement ที่มีอยู่ ผูกเข้าแถวทะเบียนที่ชื่อบริษัทตรงกันก่อน
update acc_firm_service_clients s
set client_org_id = c.client_org_id
from acc_firm_clients c
join organizations o on o.id = c.client_org_id
where s.firm_org_id = c.firm_org_id
  and s.client_org_id is null
  and btrim(s.company_name) = btrim(o.name)
  and not exists (
    select 1 from acc_firm_service_clients s2
    where s2.firm_org_id = c.firm_org_id and s2.client_org_id = c.client_org_id
  );

-- 3) backfill — ที่ยังไม่มีในทะเบียน สร้างแถวใหม่ (รหัสลูกค้าตั้งจาก slug ของ org)
insert into acc_firm_service_clients (
  firm_org_id, client_code, company_name, client_org_id, note, is_active
)
select
  c.firm_org_id,
  upper(left(regexp_replace(o.slug, '[^a-zA-Z0-9]', '', 'g'), 12)),
  o.name,
  c.client_org_id,
  c.note,
  c.status = 'active'
from acc_firm_clients c
join organizations o on o.id = c.client_org_id
where not exists (
  select 1 from acc_firm_service_clients s
  where s.firm_org_id = c.firm_org_id and s.client_org_id = c.client_org_id
)
on conflict (firm_org_id, client_code) do nothing;

comment on column acc_firm_service_clients.client_org_id is
  'org ใน PERPOS ของลูกค้ารายนี้ (null = ลูกค้าที่ไม่ได้ใช้ระบบ) — ผูกกับ engagement ใน acc_firm_clients';
