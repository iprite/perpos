-- acc_firm_service_clients: เพิ่มคอลัมน์ค่าบริการรายปี (สำหรับลูกค้าที่ชำระเป็นรายปี ไม่ใช่รายเดือน)
-- เดิมเก็บราคารายปีไว้ใน billing_note เป็นข้อความ (เช่น "รายปี 8000") → ย้ายมาเป็น field จริง

alter table public.acc_firm_service_clients
  add column if not exists fee_yearly numeric;

comment on column public.acc_firm_service_clients.fee_yearly is
  'ค่าบริการรายปี (บาท) สำหรับลูกค้าที่ชำระเป็นรายปี — ลูกค้ารายเดือนใช้ fee_<year> แทน';

-- Backfill: ดึงราคารายปีจาก billing_note เดิมที่ขึ้นต้น/มีคำว่า "รายปี" (เช่น "รายปี 8000" → 8000)
update public.acc_firm_service_clients
set fee_yearly = nullif(regexp_replace(billing_note, '\D', '', 'g'), '')::numeric
where fee_yearly is null
  and billing_note ~ 'รายปี'
  and nullif(regexp_replace(billing_note, '\D', '', 'g'), '') is not null;
