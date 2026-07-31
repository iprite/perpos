-- TMC Stock v2 — เบิกของ "ทั้งหลัง" ในใบเดียว + เตียงเสริม
-- spec: specs/tmc-stock-v2.md §4.5
--
-- ของจริงคือเช็คเอาต์ทีเดียวทั้งหลัง ไม่ใช่ทีละห้อง → 1 ใบเบิก = 1 หลัง (หลายห้องในใบเดียว)
-- movement เก็บ room_name ไว้ด้วย เพื่อให้ตอบได้ว่า "ห้องไหนกินผ้าเท่าไร" (อินพุตของ CPOR/par ในเฟสหน้า)
--
-- โครงห้อง: TMC7 = 5 ห้องนอน + พื้นที่ร่วม 4 จุด
--           TMC1 / TMC5 = เหมือน TMC7 แต่ไม่มี Pavilion (ห้องริมสระ)
--           TMC2 / TMC3-4 / TMC6 = คัดลอกจาก TMC7 ทั้งชุด (ยังไม่ยืนยันกับลูกค้า — แก้ได้ในหน้าตั้งค่า)
--
-- เตียงเสริม 2 แบบ (5 ฟุต / 3 ฟุต) = ชุดนอนคงที่ + ผ้าเช็ดตัวตามจำนวนคนที่เพิ่ม (per_guest)
-- เลือกได้ว่าจะเสริมที่ห้องไหน → เก็บใน room_name ของ movement

begin;

alter table public.tmc_stock_movements
  add column if not exists room_name text;

-- ────────────────────────────────────────────────────────────────
-- 1. คัดลอกชุดของ TMC7 ไปหลังอื่น (TMC1/TMC5 ไม่มี Pavilion)
-- ────────────────────────────────────────────────────────────────
do $$
declare
  v_org   uuid;
  v_villa text;
  src     record;
  v_new   uuid;
begin
  select id into v_org from public.organizations where slug = 'tmc';
  if v_org is null then return; end if;

  foreach v_villa in array array['TMC1','TMC2','TMC3-4','TMC5','TMC6']
  loop
    for src in
      select * from public.tmc_stock_presets
       where org_id = v_org and property_code = 'TMC7' and preset_kind = 'checkout'
       order by sort_order
    loop
      -- TMC1 / TMC5 ไม่มีห้องริมสระ
      if v_villa in ('TMC1','TMC5') and src.room_name = 'Pavilion' then
        continue;
      end if;

      insert into public.tmc_stock_presets(
        org_id, name, preset_kind, property_code, room_name,
        source_location_id, note, sort_order, created_by)
      values (
        v_org, v_villa || ' — ' || src.room_name, 'checkout', v_villa, src.room_name,
        src.source_location_id, 'คัดลอกจาก TMC7', src.sort_order, src.created_by)
      on conflict do nothing
      returning id into v_new;

      if v_new is not null then
        insert into public.tmc_stock_preset_lines(
          preset_id, item_id, qty, qty_basis, is_optional, sort_order)
        select v_new, l.item_id, l.qty, l.qty_basis, l.is_optional, l.sort_order
        from public.tmc_stock_preset_lines l
        where l.preset_id = src.id;
      end if;
      v_new := null;
    end loop;
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────
-- 2. ชุดเตียงเสริม — ใช้ได้ทุกหลัง (property_code = null)
--    ชุดนอน = คงที่ · ผ้าเช็ดตัว/ผ้าเช็ดผม = ต่อคนที่เพิ่ม
-- ────────────────────────────────────────────────────────────────
do $$
declare
  v_org uuid;
  v_linen uuid;
  v_p5 uuid;
  v_p3 uuid;
  r record;
begin
  select id into v_org from public.organizations where slug = 'tmc';
  if v_org is null then return; end if;
  select id into v_linen from public.tmc_stock_locations
   where org_id = v_org and code = 'LINEN';

  insert into public.tmc_stock_presets(
    org_id, name, preset_kind, property_code, room_name, source_location_id, note, sort_order)
  values (v_org, 'เตียงเสริม 5 ฟุต', 'custom', null, 'เตียงเสริม 5 ฟุต', v_linen,
          'ชุดนอน 1 เตียง + ผ้าเช็ดตัวตามจำนวนคนที่เพิ่ม', 900)
  on conflict do nothing
  returning id into v_p5;

  insert into public.tmc_stock_presets(
    org_id, name, preset_kind, property_code, room_name, source_location_id, note, sort_order)
  values (v_org, 'เตียงเสริม 3 ฟุต', 'custom', null, 'เตียงเสริม 3 ฟุต', v_linen,
          'ชุดนอน 1 เตียง + ผ้าเช็ดตัวตามจำนวนคนที่เพิ่ม', 910)
  on conflict do nothing
  returning id into v_p3;

  if v_p5 is not null then
    for r in
      select * from (values
        ('ผ้าปูที่นอน 5 ฟุต (สูง 14")', 1, 'fixed',     1),
        ('รองกันเปื้อนที่นอน',           1, 'fixed',     2),
        ('ปลอกผ้านวม Queen',            1, 'fixed',     3),
        ('ปลอกหมอนเล็ก',                 2, 'fixed',     4),
        ('ปลอกหมอนใหญ่',                 2, 'fixed',     5),
        ('ผ้าเช็ดตัว 30*60"',            1, 'per_guest', 6),
        ('ผ้าเช็ดผม 15*30"',             1, 'per_guest', 7)
      ) as x(name, qty, basis, ord)
    loop
      insert into public.tmc_stock_preset_lines(preset_id, item_id, qty, qty_basis, sort_order)
      select v_p5, i.id, r.qty, r.basis, r.ord
      from public.tmc_stock_items i
      where i.org_id = v_org and i.name = r.name
      on conflict do nothing;
    end loop;
  end if;

  if v_p3 is not null then
    for r in
      select * from (values
        ('ผ้าปูที่นอน 3.5 ฟุต',  1, 'fixed',     1),
        ('รองกันเปื้อนที่นอน',    1, 'fixed',     2),
        ('ปลอกผ้านวม Single',    1, 'fixed',     3),
        ('ปลอกหมอนเล็ก',          1, 'fixed',     4),
        ('ปลอกหมอนใหญ่',          1, 'fixed',     5),
        ('ผ้าเช็ดตัว 30*60"',     1, 'per_guest', 6),
        ('ผ้าเช็ดผม 15*30"',      1, 'per_guest', 7)
      ) as x(name, qty, basis, ord)
    loop
      insert into public.tmc_stock_preset_lines(preset_id, item_id, qty, qty_basis, sort_order)
      select v_p3, i.id, r.qty, r.basis, r.ord
      from public.tmc_stock_items i
      where i.org_id = v_org and i.name = r.name
      on conflict do nothing;
    end loop;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────
-- 3. RPC เบิกทั้งหลัง — 1 ใบ หลายห้อง (+ เตียงเสริม)
--    p_groups = [{preset_id, room_name, guests, lines:[{item_id, qty}]}]
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_stock_issue_rooms(
  p_org_id        uuid,
  p_property_code text,
  p_groups        jsonb,
  p_stay_id       uuid,
  p_note          text,
  p_created_by    uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue_id uuid;
  grp        jsonb;
  elem       jsonb;
  v_preset   uuid;
  v_room     text;
  v_item     uuid;
  v_qty      numeric;
  v_home     uuid;
  v_count    int := 0;
  v_total    numeric := 0;
  v_snapshot jsonb;
begin
  if p_groups is null or jsonb_array_length(p_groups) = 0 then
    raise exception 'ไม่มีรายการให้เบิก' using errcode = '23514';
  end if;
  if nullif(p_property_code,'') is null then
    raise exception 'ต้องเลือกหลัง' using errcode = '23514';
  end if;

  -- snapshot = สิ่งที่เบิกจริง แยกตามห้อง (ชุดแก้ทีหลังไม่กระทบประวัติ)
  v_snapshot := jsonb_build_object('property_code', p_property_code, 'groups', p_groups);

  insert into tmc_stock_issues(
    org_id, preset_id, preset_snapshot, property_code, room_name,
    stay_id, note, created_by
  ) values (
    p_org_id, null, v_snapshot, p_property_code, null,
    p_stay_id, nullif(p_note,''), p_created_by
  ) returning id into v_issue_id;

  for grp in select * from jsonb_array_elements(p_groups)
  loop
    v_preset := nullif(grp->>'preset_id','')::uuid;
    v_room   := nullif(grp->>'room_name','');

    for elem in select * from jsonb_array_elements(coalesce(grp->'lines', '[]'::jsonb))
    loop
      v_item := (elem->>'item_id')::uuid;
      v_qty  := (elem->>'qty')::numeric;
      if v_qty is null or v_qty <= 0 then continue; end if;

      select coalesce(i.default_location_id,
                      (select source_location_id from tmc_stock_presets where id = v_preset))
        into v_home
      from tmc_stock_items i where i.id = v_item and i.org_id = p_org_id;

      insert into tmc_stock_movements(
        org_id, item_id, movement_type, quantity,
        from_location_id, property_code, room_name,
        stay_id, issue_id, note, created_by
      ) values (
        p_org_id, v_item, 'issue', v_qty,
        v_home, p_property_code, v_room,
        p_stay_id, v_issue_id, nullif(p_note,''), p_created_by
      );

      v_count := v_count + 1;
      v_total := v_total + v_qty;
    end loop;
  end loop;

  if v_count = 0 then
    raise exception 'ไม่มีรายการให้เบิก' using errcode = '23514';
  end if;

  update tmc_stock_issues
     set line_count = v_count, total_qty = v_total
   where id = v_issue_id;

  return jsonb_build_object('issue_id', v_issue_id, 'line_count', v_count, 'total_qty', v_total);
end;
$$;

revoke all on function public.tmc_stock_issue_rooms(uuid, text, jsonb, uuid, text, uuid)
  from public, anon, authenticated;

commit;
