-- TMC Stock v2 — แก้: trigger ห้ามแก้ movement ไปบล็อก FK cleanup ด้วย
--
-- ที่มา: `tmc_stock_movements` มี FK แบบ ON DELETE SET NULL ไปยัง tmc_stays / tmc_stock_issues /
-- tmc_laundry_batches — เวลาลบแถวต้นทาง Postgres จะสั่ง UPDATE ให้ null คอลัมน์นั้น
-- แต่ trigger immutable บล็อก UPDATE ทุกกรณี → ลบการเข้าพักหรือรอบซักไม่ได้เลย
-- และเด้ง error ที่ผู้ใช้อ่านแล้วงง ("รายการเคลื่อนไหวสต๊อกแก้/ลบไม่ได้")
--
-- invariant ที่ต้องรักษาไว้คือ "ตัวเลขในบัญชีสต๊อกห้ามเปลี่ยน" ไม่ใช่ "ทุกคอลัมน์ห้ามขยับ"
-- → บล็อกเฉพาะช่องที่มีผลต่อยอด/ที่มา · ปล่อยให้ช่องอ้างอิง (link) ถูก null ได้

begin;

create or replace function public.tmc_stock_movement_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'รายการเคลื่อนไหวสต๊อกลบไม่ได้ — ให้บันทึกรายการกลับ (ref_movement_id) แทน'
      using errcode = '42501';
  end if;

  -- ช่องที่กระทบยอดคงเหลือ/ที่มา — ห้ามขยับเด็ดขาด
  if NEW.org_id           is distinct from OLD.org_id
  or NEW.item_id          is distinct from OLD.item_id
  or NEW.movement_type    is distinct from OLD.movement_type
  or NEW.quantity         is distinct from OLD.quantity
  or NEW.from_location_id is distinct from OLD.from_location_id
  or NEW.to_location_id   is distinct from OLD.to_location_id
  or NEW.reason           is distinct from OLD.reason
  or NEW.unit_cost        is distinct from OLD.unit_cost
  or NEW.created_at       is distinct from OLD.created_at
  or NEW.created_by       is distinct from OLD.created_by
  or NEW.ref_movement_id  is distinct from OLD.ref_movement_id then
    raise exception 'รายการเคลื่อนไหวสต๊อกแก้ไม่ได้ — ให้บันทึกรายการกลับ (ref_movement_id) แทน'
      using errcode = '42501';
  end if;

  -- เหลือแค่ช่องอ้างอิง (stay_id / issue_id / laundry_batch_id / property_*) → ให้ผ่าน
  -- ใช้ตอนลบเอกสารต้นทางแล้ว FK สั่ง SET NULL เท่านั้น
  return NEW;
end;
$$;

revoke all on function public.tmc_stock_movement_immutable() from public, anon, authenticated;

commit;
