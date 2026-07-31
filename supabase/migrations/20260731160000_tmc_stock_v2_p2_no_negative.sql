-- TMC Stock v2 — P2: ห้ามยอดคงเหลือติดลบทุกชนิดสินค้า (เดิมกันไว้เฉพาะของใช้ซ้ำ)
--
-- หนี้จาก P1: guard ของ API เช็คจาก "ยอดรวมทุกจุดเก็บ" ไม่ใช่ยอด ณ จุดเก็บต้นทาง
-- → เบิกของใช้จากคลังกลางได้ทั้งที่ของจริงอยู่ครัว → คลังกลางติดลบเงียบ ๆ
-- ของที่ไม่มีอยู่จริง ณ จุดนั้น ย้ายออกไม่ได้ ไม่ว่าจะเป็นของใช้แล้วหมดไปหรือของใช้ซ้ำ

begin;

create or replace function public.tmc_stock_apply_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_qty numeric;
  v_new_qty  numeric;
  v_total    numeric;
  v_delta    numeric;
  v_class    text;
  v_name     text;
  v_unit     text;
  v_loc      text;
begin
  select stock_class, name, unit into v_class, v_name, v_unit
  from tmc_stock_items where id = NEW.item_id;

  if NEW.movement_type = 'adjust' then
    if NEW.reason = 'correction_total' then
      select coalesce(sum(qty), 0) into v_total
      from tmc_stock_balances where item_id = NEW.item_id;
      v_delta := NEW.quantity - v_total;

      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.to_location_id, v_delta, now())
      on conflict (item_id, location_id)
        do update set qty = tmc_stock_balances.qty + v_delta, updated_at = now()
      returning qty into v_new_qty;

      if v_new_qty < 0 then
        raise exception 'ปรับยอดรวมเป็น % ไม่ได้ — % มีอยู่ที่จุดเก็บอื่นมากกว่านั้นแล้ว',
          NEW.quantity, v_name using errcode = '23514';
      end if;
    else
      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.to_location_id, NEW.quantity, now())
      on conflict (item_id, location_id)
        do update set qty = excluded.qty, updated_at = now();
    end if;
  else
    if NEW.from_location_id is not null then
      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.from_location_id, -NEW.quantity, now())
      on conflict (item_id, location_id)
        do update set qty = tmc_stock_balances.qty - NEW.quantity, updated_at = now()
      returning qty into v_from_qty;

      -- ยอดคงเหลือติดลบไม่ได้ — ของที่ไม่มีอยู่จริง ณ จุดนั้น ย้ายออกไม่ได้
      if v_from_qty < 0 then
        select name into v_loc from tmc_stock_locations where id = NEW.from_location_id;
        raise exception '% ที่ % เหลือ % % — เบิก/ย้าย % % ไม่ได้',
          v_name, coalesce(v_loc,'จุดเก็บต้นทาง'), v_from_qty + NEW.quantity, v_unit,
          NEW.quantity, v_unit
          using errcode = '23514';
      end if;
    end if;

    if NEW.to_location_id is not null then
      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.to_location_id, NEW.quantity, now())
      on conflict (item_id, location_id)
        do update set qty = tmc_stock_balances.qty + NEW.quantity, updated_at = now();
    end if;
  end if;

  update tmc_stock_items i
     set current_qty = coalesce(
       (select sum(b.qty) from tmc_stock_balances b where b.item_id = NEW.item_id), 0)
   where i.id = NEW.item_id;

  return NEW;
end;
$$;

revoke all on function public.tmc_stock_apply_movement() from public, anon, authenticated;

commit;
