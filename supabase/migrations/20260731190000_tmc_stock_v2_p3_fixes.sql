-- TMC Stock v2 — P3 (แก้จากรีวิว)
--
-- 1) ต้นทางของบรรทัดในชุดต้องยึด "บ้านของของชิ้นนั้น" ก่อน source ของชุด
--    ทุกชุดที่ seed มาตั้ง source = ห้องผ้าสะอาด · วันนี้บรรทัดเป็นผ้าล้วนจึงบังเอิญตรง
--    แต่พอมีคนเพิ่ม "แปรงสีฟัน" (บ้าน = คลังกลาง) เข้าชุด ระบบจะไปหักจากห้องผ้าสะอาด
--    ขณะที่หน้าจอโชว์คงเหลือของคลังกลาง = ตัวเลขบนจอกับที่ตัดจริงคนละที่
--    → ให้ source ของชุดเป็น "ตัวสำรอง" ใช้เฉพาะของที่ยังไม่มีบ้าน
--
-- 2) กัน movement ข้าม org — item_id มาจาก client (ทั้ง /movements และ RPC เบิกชุด)
--    ถ้าส่ง id ของสินค้า org อื่นมา จะเขียน movement ใต้ org เราแต่ไปขยับยอดของ org นั้น

begin;

-- ── 1. ต้นทางต่อบรรทัด ────────────────────────────────────────────
create or replace function public.tmc_stock_issue_preset(
  p_org_id        uuid,
  p_preset_id     uuid,
  p_property_code text,
  p_to_location_id uuid,
  p_stay_id       uuid,
  p_guests        integer,
  p_nights        integer,
  p_lines         jsonb,
  p_note          text,
  p_created_by    uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preset    public.tmc_stock_presets%rowtype;
  v_issue_id  uuid;
  v_snapshot  jsonb;
  v_lines     jsonb;
  elem        jsonb;
  v_item      uuid;
  v_qty       numeric;
  v_home      uuid;
  v_count     int := 0;
  v_total     numeric := 0;
begin
  if p_preset_id is not null then
    select * into v_preset from tmc_stock_presets
     where id = p_preset_id and org_id = p_org_id;
    if not found then
      raise exception 'ไม่พบชุดเบิกของที่ระบุ' using errcode = '23503';
    end if;
  end if;

  select jsonb_build_object(
           'preset', to_jsonb(v_preset),
           'lines', coalesce(jsonb_agg(to_jsonb(l) order by l.sort_order), '[]'::jsonb))
    into v_snapshot
  from tmc_stock_preset_lines l where l.preset_id = p_preset_id;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', l.item_id,
             'qty', l.qty * case l.qty_basis
                              when 'per_guest' then greatest(coalesce(p_guests, 1), 1)
                              when 'per_night' then greatest(coalesce(p_nights, 1), 1)
                              else 1 end)), '[]'::jsonb)
      into v_lines
    from tmc_stock_preset_lines l
    where l.preset_id = p_preset_id and not l.is_optional;
  else
    v_lines := p_lines;
  end if;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'ไม่มีรายการให้เบิก' using errcode = '23514';
  end if;

  insert into tmc_stock_issues(
    org_id, preset_id, preset_snapshot, property_code, room_name,
    to_location_id, stay_id, guests, nights, note, created_by
  ) values (
    p_org_id, p_preset_id, v_snapshot,
    coalesce(nullif(p_property_code,''), v_preset.property_code), v_preset.room_name,
    p_to_location_id, p_stay_id, p_guests, p_nights, nullif(p_note,''), p_created_by
  ) returning id into v_issue_id;

  for elem in select * from jsonb_array_elements(v_lines)
  loop
    v_item := (elem->>'item_id')::uuid;
    v_qty  := (elem->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      continue;
    end if;

    -- บ้านของของชิ้นนั้นมาก่อน · source ของชุดเป็นตัวสำรอง
    select coalesce(i.default_location_id, v_preset.source_location_id)
      into v_home
    from tmc_stock_items i where i.id = v_item and i.org_id = p_org_id;

    insert into tmc_stock_movements(
      org_id, item_id, movement_type, quantity,
      from_location_id, to_location_id, property_code,
      stay_id, issue_id, note, created_by
    ) values (
      p_org_id, v_item, 'issue', v_qty,
      v_home, p_to_location_id,
      coalesce(nullif(p_property_code,''), v_preset.property_code),
      p_stay_id, v_issue_id, nullif(p_note,''), p_created_by
    );

    v_count := v_count + 1;
    v_total := v_total + v_qty;
  end loop;

  update tmc_stock_issues
     set line_count = v_count, total_qty = v_total
   where id = v_issue_id;

  return jsonb_build_object('issue_id', v_issue_id, 'line_count', v_count, 'total_qty', v_total);
end;
$$;

-- ── 2. กัน movement ข้าม org ──────────────────────────────────────
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
begin
  select i.org_id, i.stock_class, i.consumes_on_issue,
         coalesce(i.default_location_id,
                  (select id from tmc_stock_locations
                    where org_id = NEW.org_id and is_default limit 1))
    into v_item_org, v_class, v_consumes, v_home
  from tmc_stock_items i where i.id = NEW.item_id;

  if v_item_org is null then
    raise exception 'ไม่พบรายการสินค้า' using errcode = '23503';
  end if;
  -- item_id มาจาก client — สินค้าต้องอยู่ org เดียวกับ movement เสมอ
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

  if NEW.from_location_id is null and NEW.to_location_id is null then
    raise exception 'movement ต้องมีต้นทางหรือปลายทางอย่างน้อยหนึ่งฝั่ง' using errcode = '23514';
  end if;

  if NEW.from_location_id = NEW.to_location_id then
    raise exception 'ต้นทางกับปลายทางเป็นที่เดียวกันไม่ได้' using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke all on function public.tmc_stock_normalize_movement() from public, anon, authenticated;
revoke all on function public.tmc_stock_issue_preset(uuid, uuid, text, uuid, uuid, integer, integer, jsonb, text, uuid)
  from public, anon, authenticated;

commit;
