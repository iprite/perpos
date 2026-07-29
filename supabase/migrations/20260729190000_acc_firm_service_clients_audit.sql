-- acc_firm — ร่องรอยการแก้ไขทะเบียนลูกค้า
--
-- ตารางนี้ผูกกับเงิน (ค่าบริการรายปี) และข้อมูลนิติบุคคล (เลขผู้เสียภาษี/VAT) ที่ไปโผล่
-- ในคลังเอกสาร — แก้ย้อนหลังแล้วไม่รู้ว่าใครแก้เมื่อไรไม่ได้
--
-- updated_at: trigger เขียนให้เสมอทุก UPDATE (แอปแก้ค่าเองไม่ได้)
-- updated_by: แอปส่งมาเอง (service-role client ไม่มี auth.uid())

alter table acc_firm_service_clients
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references profiles (id) on delete set null;

create or replace function set_acc_firm_service_clients_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_acc_firm_service_clients_updated_at on acc_firm_service_clients;
create trigger trg_acc_firm_service_clients_updated_at
  before update on acc_firm_service_clients
  for each row
  execute function set_acc_firm_service_clients_updated_at();

comment on column acc_firm_service_clients.updated_at is
  'เวลาแก้ไขล่าสุด — เขียนโดย trigger เท่านั้น';
comment on column acc_firm_service_clients.updated_by is
  'ผู้แก้ไขล่าสุด (profiles.id) — API เป็นคนใส่';
