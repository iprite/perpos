-- gov_procure: ผูก LINE group ของทีมนักลงทุน (1 กลุ่มต่อ org)
-- ใช้เป็นปลายทาง push รายงาน/แจ้งเตือนเปลี่ยนสถานะ + ช่องรับคำสั่งจากกลุ่ม
alter table public.gov_procure_settings
  add column if not exists line_group_id       text,
  add column if not exists line_group_name     text,
  add column if not exists line_group_bound_at timestamptz,
  add column if not exists line_group_bound_by uuid references public.profiles(id) on delete set null;

-- กลุ่มหนึ่งผูกได้กับ org เดียวเท่านั้น
create unique index if not exists gov_procure_settings_line_group_uniq
  on public.gov_procure_settings (line_group_id) where line_group_id is not null;
