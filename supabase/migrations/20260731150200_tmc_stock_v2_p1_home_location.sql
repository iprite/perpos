-- TMC Stock v2 — P1 (แก้): "บ้าน" ของสินค้าแต่ละชิ้น + กันของใช้ซ้ำติดลบ
--
-- บั๊กที่เจอตอนเทส: เบิกผ้าโดยไม่ระบุต้นทาง → ระบบหักจาก "คลังกลาง" (ค่าตั้งต้นของ org)
-- ทั้งที่ผ้าอยู่ "ห้องผ้าสะอาด" → คลังกลางติดลบ (WH = −4)
-- แก้: ให้แต่ละสินค้ามีจุดเก็บประจำ (default_location_id) ใช้เป็นต้นทาง/ปลายทางเริ่มต้น
--      + apply trigger บล็อกไม่ให้ของใช้ซ้ำติดลบ (invariant §3)

begin;

alter table public.tmc_stock_items
  add column if not exists default_location_id uuid references public.tmc_stock_locations(id);

comment on column public.tmc_stock_items.default_location_id is
  'จุดเก็บประจำของสินค้าชิ้นนี้ — ใช้เป็นต้นทาง/ปลายทางเมื่อ movement ไม่ระบุ (ผ้า = ห้องผ้าสะอาด, ของใช้ = คลังกลาง)';

update public.tmc_stock_items i
   set default_location_id = l.id
  from public.tmc_stock_locations l
 where l.org_id = i.org_id
   and i.default_location_id is null
   and l.code = case when i.item_group in ('linen','bedding') then 'LINEN' else 'WH' end;

create or replace function public.tmc_stock_normalize_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_home         uuid;   -- จุดเก็บประจำของสินค้าชิ้นนี้ (ไม่มีก็ใช้คลังตั้งต้นของ org)
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
    NEW.to_location_id := coalesce(NEW.to_location_id, v_prop_loc, v_home);
    NEW.reason := coalesce(NEW.reason, 'correction');

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

  if NEW.from_location_id is null and NEW.to_location_id is null
     and NEW.movement_type <> 'adjust' then
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
  v_class    text;
  v_name     text;
begin
  if NEW.movement_type = 'adjust' then
    insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
    values (NEW.org_id, NEW.item_id, NEW.to_location_id, NEW.quantity, now())
    on conflict (item_id, location_id)
      do update set qty = excluded.qty, updated_at = now();
  else
    if NEW.from_location_id is not null then
      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.from_location_id, -NEW.quantity, now())
      on conflict (item_id, location_id)
        do update set qty = tmc_stock_balances.qty - NEW.quantity, updated_at = now()
      returning qty into v_from_qty;

      -- ของใช้ซ้ำติดลบไม่ได้ (invariant §3) — ของที่ไม่มีอยู่จริง ย้ายออกไม่ได้
      if v_from_qty < 0 then
        select stock_class, name into v_class, v_name from tmc_stock_items where id = NEW.item_id;
        if v_class = 'reusable' then
          raise exception 'ยอดคงเหลือไม่พอที่จุดเก็บต้นทาง (% คงเหลือ %)', v_name, v_from_qty + NEW.quantity
            using errcode = '23514';
        end if;
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


-- ปิดช่องเรียก trigger function ผ่าน PostgREST (/rest/v1/rpc/...) — ตามกฎ RPC ของ repo
alter function public.tmc_stock_movement_immutable() set search_path = public;

revoke all on function public.tmc_stock_normalize_movement() from public, anon, authenticated;
revoke all on function public.tmc_stock_apply_movement()     from public, anon, authenticated;
revoke all on function public.tmc_stock_movement_immutable() from public, anon, authenticated;

commit;
