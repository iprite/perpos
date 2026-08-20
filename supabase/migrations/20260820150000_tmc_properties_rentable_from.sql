-- TMC: วันแรกที่ห้อง "เปิดขาย" — กันอัตราการเข้าพักย้อนหลังเพี้ยนตอนเปิดห้องใหม่
--
-- เดิมมีแค่ธง is_rentable ⇒ วันที่กดเปิดห้องใหม่ ตัวหาร (ห้อง×คืน) ของ **ทุกเดือนย้อนหลัง**
-- จะกระโดดตามทันที ทั้งที่เดือนนั้นห้องยังไม่ได้เปิดขาย
-- NULL = เปิดขายมาตลอด (พฤติกรรมเดิม) · มีค่า = นับเป็นห้องเปิดขายเฉพาะคืนตั้งแต่วันนั้น
-- นิยามที่โค้ดใช้: apps/perpos/src/lib/tmc/rentable.ts (ใช้ร่วมทั้งการ์ดรายวันและแดชบอร์ด)

alter table public.tmc_properties
  add column if not exists rentable_from date;

comment on column public.tmc_properties.rentable_from is
  'วันแรกที่ห้องเปิดขาย (NULL = เปิดขายมาตลอด) — ใช้เป็นขอบซ้ายของตัวหารอัตราการเข้าพัก';

-- TMC2 และ TMC3-4 เปิดขายจริง 1 ธ.ค. 2026 (ก่อนหน้านั้นไม่นับทั้งตัวตั้งและตัวหาร)
update public.tmc_properties
   set is_rentable = true,
       rentable_from = date '2026-12-01'
 where code in ('TMC2', 'TMC3-4')
   and org_id = '1f52618c-09c4-49c5-a929-ea5060f26e7d';
