-- ชุด "ของใช้สิ้นเปลือง" ต่อหลัง — ถอดจากไฟล์เสียงเจ้าของ (2026-07-31)
-- spec: specs/tmc-stock-v2.md §4.5
--
-- เงื่อนไขการนับที่ถอดมาจากเสียง:
--   จำนวนห้องน้ำ = จำนวนห้องนอน + 1 (ห้องน้ำกลาง)  → qty_basis ใหม่ 'per_bathroom'
--   ทิชชูม้วน · คัตเติลบัด(ไม้ปั่นหู) · หมวกอาบน้ำ · ถุงขยะห้องน้ำ = ต่อห้องน้ำ
--   กาแฟแคปซูล 15 · น้ำดื่มขวดเล็ก 24 · เซ็ตมินิบาร์ 1 · เม็ดล้างจาน 2 = จำนวนตายตัวต่อหลัง
--   ของเหลว (สบู่/แชมพู/ครีมนวด/สบู่ล้างมือ/น้ำยาล้างจาน) = เติมจากแกลลอนกลาง
--     → ตั้งเป็น is_optional (ขึ้นในใบแต่ไม่เบิกอัตโนมัติ ติ๊กเอาเมื่อจะยกแกลลอนขึ้นบ้าน)
--
-- ที่ยังต้องให้ลูกค้ายืนยัน (เดาจากขนาดถุง — แก้ได้ในหน้าตั้งค่า):
--   ห้องน้ำ = ถุงขยะ 18*20 · ครัว = 30*40 · แพนทรี = 24*28

begin;

alter table public.tmc_stock_preset_lines drop constraint if exists tmc_stock_preset_lines_qty_basis_check;
alter table public.tmc_stock_preset_lines
  add constraint tmc_stock_preset_lines_qty_basis_check
  check (qty_basis in ('fixed','per_guest','per_night','per_bed','per_bathroom'));

do $$
declare v_org uuid; v_wh uuid; r record;
begin
  select id into v_org from public.organizations where slug='tmc';
  select id into v_wh from public.tmc_stock_locations where org_id=v_org and code='WH';

  for r in select * from (values
    ('กาแฟแคปซูล',        'อัน',   'ของอาหารเช้า',  'fnb'),
    ('น้ำดื่มขวดเล็ก',    'ขวด',   'ของอาหารเช้า',  'fnb'),
    ('ทิชชูแผ่น (กล่อง)', 'แพ็ก',  'ของใช้ห้องน้ำ', 'amenity'),
    ('ทิชชูครัว (หนา)',   'แพ็ก',  'ของใช้แม่บ้าน', 'cleaning'),
    ('เม็ดล้างจาน',       'เม็ด',  'ของใช้แม่บ้าน', 'cleaning'),
    ('สบู่เหลว',          'แกลอน', 'ของใช้ห้องน้ำ', 'amenity'),
    ('สบู่ล้างมือ',       'แกลอน', 'ของใช้ห้องน้ำ', 'amenity'),
    ('น้ำยาล้างจาน',      'แกลอน', 'ของใช้แม่บ้าน', 'cleaning'),
    ('เซ็ตมินิบาร์',      'เซ็ต',  'ของอาหารเช้า',  'fnb')
  ) as x(name, unit, category, grp)
  loop
    insert into public.tmc_stock_items
      (org_id, name, unit, category, stock_class, item_group, consumes_on_issue, default_location_id)
    select v_org, r.name, r.unit, r.category, 'consumable', r.grp, true, v_wh
    where not exists (select 1 from public.tmc_stock_items i
                       where i.org_id=v_org and i.name=r.name);
  end loop;
end $$;

do $$
declare
  v_org uuid; v_wh uuid; v_villa text; v_preset uuid; r record;
begin
  select id into v_org from public.organizations where slug='tmc';
  select id into v_wh from public.tmc_stock_locations where org_id=v_org and code='WH';

  foreach v_villa in array array['TMC1','TMC2','TMC3-4','TMC5','TMC6','TMC7']
  loop
    insert into public.tmc_stock_presets(
      org_id, name, preset_kind, property_code, room_name, source_location_id, note, sort_order)
    values (v_org, v_villa || ' — ของใช้สิ้นเปลือง', 'checkout', v_villa, 'ของใช้สิ้นเปลือง',
            v_wh, 'จากไฟล์เสียงเจ้าของ · ห้องน้ำ = ห้องนอน + 1', 5)
    on conflict do nothing
    returning id into v_preset;

    if v_preset is null then continue; end if;

    for r in select * from (values
      ('กาแฟแคปซูล',        15, 'fixed',        false,  1),
      ('น้ำดื่มขวดเล็ก',    24, 'fixed',        false,  2),
      ('เซ็ตมินิบาร์',       1, 'fixed',        false,  3),
      ('กระดาษทิชชู่ม้วน',   1, 'per_bathroom', false, 10),
      ('ทิชชูแผ่น (กล่อง)',  1, 'fixed',        false, 11),
      ('ทิชชูครัว (หนา)',    1, 'fixed',        false, 12),
      ('คัตเติลบัด',         1, 'per_bathroom', false, 20),
      ('หมวกคลุมอาบน้ำ',     2, 'per_bathroom', false, 21),
      ('ถุงขยะ 18*20',       1, 'per_bathroom', false, 30),
      ('ถุงขยะ 30*40',       1, 'fixed',        false, 31),
      ('ถุงขยะ 24*28',       1, 'fixed',        false, 32),
      ('สก๊อตไบร์ทล้างจาน',  1, 'fixed',        false, 40),
      ('ฟองน้ำล้างแก้ว',     1, 'fixed',        false, 41),
      ('เม็ดล้างจาน',        2, 'fixed',        false, 42),
      ('สบู่เหลว',           1, 'fixed',        true,  50),
      ('ยาสระผม',            1, 'fixed',        true,  51),
      ('ครีมนวดผม',          1, 'fixed',        true,  52),
      ('สบู่ล้างมือ',        1, 'fixed',        true,  53),
      ('น้ำยาล้างจาน',       1, 'fixed',        true,  54)
    ) as x(name, qty, basis, optional, ord)
    loop
      insert into public.tmc_stock_preset_lines(preset_id, item_id, qty, qty_basis, is_optional, sort_order)
      select v_preset, i.id, r.qty, r.basis, r.optional, r.ord
      from public.tmc_stock_items i
      where i.org_id=v_org and i.name=r.name
      on conflict do nothing;
    end loop;
    v_preset := null;
  end loop;
end $$;

commit;
