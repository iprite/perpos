-- TMC Stock v2 — P1 (แก้ 2): ปุ่ม "ปรับยอด" ของหน้าจอเดิมต้องยังหมายถึง "ยอดรวมของรายการนี้"
--
-- ปัญหาที่เจอตอนรีวิว: โครงใหม่ทำให้ 'adjust' = ตั้งยอด ณ จุดเก็บเดียว
--   ผู้ใช้เบิกผ้าไป TMC3-4 4 ผืน (ห้องผ้าสะอาดเหลือ 228) แล้วกด "ปรับ" เป็น 230
--   → ห้องผ้าสะอาด = 230, TMC3-4 = 4 → ยอดรวม 234 ไม่ใช่ 230 ที่พิมพ์
--   (ยังไม่พังตอนนี้เพราะของยังอยู่จุดเก็บเดียว แต่จะพังทันทีที่เบิกผ้าเข้าห้องครั้งแรก)
--
-- แก้: แยก 2 ความหมายให้ชัด แล้วบันทึกไว้ที่ reason เพื่อให้ตรวจย้อนได้
--   reason = 'correction_total'    → ไม่ระบุจุดเก็บ (หน้าจอเดิม) = ตั้ง "ยอดรวม" โดยปรับส่วนต่างที่จุดเก็บประจำ
--   reason = 'correction'          → ระบุจุดเก็บมาชัด (ใบตรวจนับใน P6) = ตั้งยอด ณ จุดเก็บนั้นตรง ๆ

begin;

create or replace function public.tmc_stock_normalize_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home         uuid;
  v_prop_loc     uuid;
  v_class        text;
  v_consumes     boolean;
begin
  select i.stock_class, i.consumes_on_issue,
         coalesce(i.default_location_id,
                  (select id from tmc_stock_locations
                    where org_id = NEW.org_id and is_default limit 1))
    into v_class, v_consumes, v_home
  from tmc_stock_items i where i.id = NEW.item_id;

  if NEW.property_id is not null or nullif(NEW.property_code,'') is not null then
    select l.id into v_prop_loc
    from tmc_stock_locations l
    where l.org_id = NEW.org_id
      and l.kind = 'property'
      and (l.property_id = NEW.property_id or l.code = NEW.property_code)
    limit 1;
  end if;

  if NEW.movement_type in ('in','receive') then
    NEW.to_location_id := coalesce(NEW.to_location_id, v_home);

  elsif NEW.movement_type in ('out','issue','consume') then
    NEW.from_location_id := coalesce(NEW.from_location_id, v_home);
    if NEW.to_location_id is null then
      if v_class = 'consumable' and coalesce(v_consumes, true) then
        NEW.to_location_id := null;
        NEW.reason := coalesce(NEW.reason, 'consumed');
      else
        NEW.to_location_id := v_prop_loc;
      end if;
    end if;

  elsif NEW.movement_type = 'adjust' then
    if NEW.to_location_id is null then
      -- ไม่ระบุจุดเก็บ = ตั้งยอดรวมของทั้งรายการ (ความหมายเดิมของหน้าจอ)
      NEW.to_location_id := coalesce(v_prop_loc, v_home);
      NEW.reason := coalesce(nullif(NEW.reason,''), 'correction_total');
    else
      NEW.reason := coalesce(nullif(NEW.reason,''), 'correction');
    end if;

  elsif NEW.movement_type in ('retire','lost') then
    NEW.from_location_id := coalesce(NEW.from_location_id, v_prop_loc, v_home);
    NEW.to_location_id := null;

  elsif NEW.movement_type in ('transfer','send_wash','return_wash','sale') then
    NEW.from_location_id := coalesce(NEW.from_location_id, v_home);
  end if;

  if v_class = 'reusable'
     and NEW.to_location_id is null
     and NEW.movement_type not in ('retire','lost') then
    raise exception 'ของใช้ซ้ำต้องระบุปลายทาง — ถ้าจะตัดออกจากระบบให้ใช้ retire หรือ lost'
      using errcode = '23514';
  end if;

  if NEW.movement_type in ('retire','lost') and nullif(NEW.reason,'') is null then
    raise exception 'ตัดของออกจากระบบต้องระบุเหตุผล (reason)' using errcode = '23514';
  end if;

  if NEW.from_location_id is null and NEW.to_location_id is null then
    raise exception 'movement ต้องมีต้นทางหรือปลายทางอย่างน้อยหนึ่งฝั่ง' using errcode = '23514';
  end if;

  if NEW.from_location_id = NEW.to_location_id then
    raise exception 'ต้นทางกับปลายทางเป็นที่เดียวกันไม่ได้' using errcode = '23514';
  end if;

  return NEW;
end;
$$;

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
begin
  select stock_class, name into v_class, v_name from tmc_stock_items where id = NEW.item_id;

  if NEW.movement_type = 'adjust' then
    if NEW.reason = 'correction_total' then
      -- ตั้งยอดรวมทั้งรายการ → ปรับเฉพาะส่วนต่างที่จุดเก็บนี้
      select coalesce(sum(qty), 0) into v_total
      from tmc_stock_balances where item_id = NEW.item_id;
      v_delta := NEW.quantity - v_total;

      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.to_location_id, v_delta, now())
      on conflict (item_id, location_id)
        do update set qty = tmc_stock_balances.qty + v_delta, updated_at = now()
      returning qty into v_new_qty;

      if v_new_qty < 0 and v_class = 'reusable' then
        raise exception 'ปรับยอดรวมเป็น % ไม่ได้ — % มีอยู่ที่จุดเก็บอื่นมากกว่านั้นแล้ว', NEW.quantity, v_name
          using errcode = '23514';
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

      -- ของใช้ซ้ำติดลบไม่ได้ (invariant §3) — ของที่ไม่มีอยู่จริง ย้ายออกไม่ได้
      if v_from_qty < 0 and v_class = 'reusable' then
        raise exception 'ยอดคงเหลือไม่พอที่จุดเก็บต้นทาง (% คงเหลือ %)', v_name, v_from_qty + NEW.quantity
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

revoke all on function public.tmc_stock_normalize_movement() from public, anon, authenticated;
revoke all on function public.tmc_stock_apply_movement()     from public, anon, authenticated;

commit;
