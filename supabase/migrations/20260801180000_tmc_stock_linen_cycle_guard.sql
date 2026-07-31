-- วงจรผ้า (ห้องผ้าสะอาด · ผ้าเปื้อนรอส่ง · ร้านซัก) เก็บได้เฉพาะผ้า/เครื่องนอน
--
-- ที่มา: ตอนตั้งยอดตั้งต้นมีคนใส่ของที่ไม่ใช่ผ้า (equipment) ไว้ที่ห้องผ้าสะอาด
--   → ยอดไปกองผิดที่ แล้วหน้าเบิกของเห็นเป็น 0 เพราะไปหักจากจุดเก็บประจำของรายการนั้น
-- ด่านฝั่ง UI กันได้เฉพาะทางที่ผ่านหน้าจอ จึงต้องมีด่านที่ DB ให้ทุกทางเข้าเจอกฎเดียวกัน

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
  v_item_org     uuid;
  v_group        text;
  v_bad_loc      text;
begin
  select i.org_id, i.stock_class, i.consumes_on_issue, i.item_group,
         coalesce(i.default_location_id,
                  (select id from tmc_stock_locations
                    where org_id = NEW.org_id and is_default limit 1))
    into v_item_org, v_class, v_consumes, v_group, v_home
  from tmc_stock_items i where i.id = NEW.item_id;

  if v_item_org is null then
    raise exception 'ไม่พบรายการสินค้า' using errcode = '23503';
  end if;
  if v_item_org <> NEW.org_id then
    raise exception 'สินค้าไม่ได้อยู่ในองค์กรนี้' using errcode = '42501';
  end if;

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

  -- ของที่ไม่ใช่ผ้า/เครื่องนอน ห้ามเข้า-ออกวงจรผ้า (เช็คหลัง normalize จึงครอบคลุมค่าที่เติมให้เอง)
  if coalesce(v_group,'') not in ('linen','bedding') then
    select l.name into v_bad_loc
    from tmc_stock_locations l
    where l.id in (NEW.from_location_id, NEW.to_location_id)
      and l.kind in ('linen_room','soiled','laundry')
    limit 1;
    if v_bad_loc is not null then
      raise exception '% เก็บได้เฉพาะผ้าและเครื่องนอน — รายการนี้ไม่ใช่ผ้า', v_bad_loc
        using errcode = '23514';
    end if;
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

commit;
