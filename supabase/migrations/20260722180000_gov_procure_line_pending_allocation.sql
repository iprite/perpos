-- gov_procure: รองรับคำสั่ง /กระจายทุน และ /คืนทุน จากกลุ่ม LINE (ต้องกดยืนยันเหมือน /ลงขัน)
alter table public.gov_procure_line_pending
  drop constraint if exists gov_procure_line_pending_kind_check;

alter table public.gov_procure_line_pending
  add constraint gov_procure_line_pending_kind_check
  check (kind in ('contribution', 'allocation', 'return_to_pool', 'new_order'));
