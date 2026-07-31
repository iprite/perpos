-- TMC Stock v2 — ชุดของประจำห้องของ TMC7 (ข้อมูลจริงจากลูกค้า)
-- ที่มา: ไฟล์เสียง "หมู่บ้านเลอนีโอทู ศรีนครินทร์" (2026-07-31) — เจ้าของไล่ของทีละห้อง
--
-- TMC7 มี 5 ห้องนอน (Standard 1 · Pavilion · Master · Standard 2 · Grand Family)
-- + พื้นที่ร่วม 4 จุด (กลางบ้าน · ห้องน้ำกลาง · โต๊ะกินข้าว · ครัว) = 9 ชุด
--
-- หน่วยทุกบรรทัด = ผืน (ตามที่ลูกค้าสั่ง — ในไฟล์เสียงพูดสลับ ชิ้น/ผืน)
-- ทุกบรรทัดเป็น qty_basis='fixed' — ไฟล์เสียงพูดจำนวนตายตัวต่อห้อง ไม่ได้ผูกกับจำนวนผู้เข้าพัก
--
-- การจับคู่ชื่อของในไฟล์เสียง → สินค้าในระบบ (ตัดสินใจร่วมกับลูกค้าแล้ว):
--   ผ้าขนหนู           → ผ้าเช็ดตัว 30*60"
--   ผ้าปู 5 ฟุต        → ผ้าปูที่นอน 5 ฟุต (สูง 14")
--   ปลอกผ้าห่ม 6 ฟุต   → ปลอกผ้านวม King   ·  5 ฟุต → ปลอกผ้านวม Queen
--   ผ้ารอง / ผ้ารองกันเปื้อน → รองกันเปื้อนที่นอน (ตัวเดียว ไม่แยกขนาด)
--   ผ้าเช็ดเท้า        → ผ้าเช็ดเท้า Welcome
-- ของ 4 อย่างที่ไม่มีในระบบ สร้างใหม่ในไฟล์นี้: ปลอกหมอนเล็ก · ปลอกหมอนใหญ่ ·
-- ผ้าเช็ดจาน · ผ้าเช็ดเท้าครัว (สีดำ)  ← เดิมมีแต่ "ปลอกหมอนหนุน" ตัวเดียวที่ไม่แยกขนาด
--
-- idempotent: รันซ้ำได้ (ลบบรรทัดของชุดเดิมแล้วใส่ใหม่ตามไฟล์นี้)

begin;

do $$
declare
  v_org      uuid;
  v_linen    uuid;   -- ห้องผ้าสะอาด = ต้นทางของผ้าทุกผืน
  v_preset   uuid;
  v_room     text;
  v_item     uuid;
  r          record;
begin
  select id into v_org from public.organizations where slug = 'tmc';
  if v_org is null then
    raise notice 'ไม่พบ org "tmc" — ข้าม seed';
    return;
  end if;

  select id into v_linen from public.tmc_stock_locations
   where org_id = v_org and code = 'LINEN';

  -- ── 1. สินค้าที่ยังไม่มีในระบบ ────────────────────────────────
  insert into public.tmc_stock_items
    (org_id, name, unit, category, stock_class, item_group,
     consumes_on_issue, default_location_id)
  select v_org, x.name, 'ผืน', 'ผ้า', 'reusable', 'linen', false, v_linen
    from (values
      ('ปลอกหมอนเล็ก'),
      ('ปลอกหมอนใหญ่'),
      ('ผ้าเช็ดจาน'),
      ('ผ้าเช็ดเท้าครัว (สีดำ)')
    ) as x(name)
   where not exists (
     select 1 from public.tmc_stock_items i
      where i.org_id = v_org and i.name = x.name);

  -- ── 2. ชุดของแต่ละห้อง ───────────────────────────────────────
  for r in
    select * from (values
      -- (ห้อง, ลำดับ, ชื่อของ, จำนวน, ลำดับบรรทัด)
      ('Standard 1', 10, 'ผ้าปูที่นอน 6 ฟุต (สูง 14")',   1,  1),
      ('Standard 1', 10, 'รองกันเปื้อนที่นอน',              1,  2),
      ('Standard 1', 10, 'ปลอกผ้านวม King',                1,  3),
      ('Standard 1', 10, 'ปลอกหมอนเล็ก',                   2,  4),
      ('Standard 1', 10, 'ปลอกหมอนใหญ่',                   2,  5),
      ('Standard 1', 10, 'ผ้าเช็ดตัว 30*60"',              2,  6),
      ('Standard 1', 10, 'ผ้าเช็ดผม 15*30"',               2,  7),
      ('Standard 1', 10, 'ผ้าเช็ดเท้า Welcome',            2,  8),
      ('Standard 1', 10, 'ผ้าเช็ดมือ',                     2,  9),

      ('Pavilion',   20, 'ผ้าปูที่นอน 5 ฟุต (สูง 14")',    1,  1),
      ('Pavilion',   20, 'รองกันเปื้อนที่นอน',              1,  2),
      ('Pavilion',   20, 'ปลอกผ้านวม Queen',               1,  3),
      ('Pavilion',   20, 'ปลอกหมอนเล็ก',                   2,  4),
      ('Pavilion',   20, 'ปลอกหมอนใหญ่',                   2,  5),
      ('Pavilion',   20, 'ผ้าเช็ดตัว 30*60"',              2,  6),
      ('Pavilion',   20, 'ผ้าเช็ดผม 15*30"',               2,  7),
      ('Pavilion',   20, 'ผ้าเช็ดเท้า Welcome',            3,  8),
      -- ห้องนี้ไม่มีผ้าเช็ดมือ — ในไฟล์เสียงไม่ได้พูดถึง (ห้องอื่นมีทุกห้อง)

      ('Master',     30, 'ผ้าปูที่นอน 6 ฟุต (สูง 14")',   1,  1),
      ('Master',     30, 'รองกันเปื้อนที่นอน',              1,  2),
      ('Master',     30, 'ปลอกผ้านวม King',                1,  3),
      ('Master',     30, 'ปลอกหมอนเล็ก',                   2,  4),
      ('Master',     30, 'ปลอกหมอนใหญ่',                   2,  5),
      ('Master',     30, 'ผ้าเช็ดตัว 30*60"',              2,  6),
      ('Master',     30, 'ผ้าเช็ดผม 15*30"',               2,  7),
      ('Master',     30, 'ผ้าเช็ดเท้า Welcome',            2,  8),
      ('Master',     30, 'ผ้าเช็ดมือ',                     2,  9),

      ('Standard 2', 40, 'ผ้าปูที่นอน 6 ฟุต (สูง 14")',   1,  1),
      ('Standard 2', 40, 'รองกันเปื้อนที่นอน',              1,  2),
      ('Standard 2', 40, 'ปลอกผ้านวม King',                1,  3),
      ('Standard 2', 40, 'ปลอกหมอนเล็ก',                   2,  4),
      ('Standard 2', 40, 'ปลอกหมอนใหญ่',                   2,  5),
      ('Standard 2', 40, 'ผ้าเช็ดตัว 30*60"',              2,  6),
      ('Standard 2', 40, 'ผ้าเช็ดผม 15*30"',               2,  7),
      ('Standard 2', 40, 'ผ้าเช็ดเท้า Welcome',            2,  8),
      ('Standard 2', 40, 'ผ้าเช็ดมือ',                     2,  9),

      -- ห้องนี้มี 2 เตียง 5 ฟุต → ของนอนคูณสอง
      ('Grand Family', 50, 'ผ้าปูที่นอน 5 ฟุต (สูง 14")', 2,  1),
      ('Grand Family', 50, 'รองกันเปื้อนที่นอน',            2,  2),
      ('Grand Family', 50, 'ปลอกผ้านวม Queen',             2,  3),
      ('Grand Family', 50, 'ปลอกหมอนเล็ก',                 4,  4),
      ('Grand Family', 50, 'ปลอกหมอนใหญ่',                 4,  5),
      ('Grand Family', 50, 'ผ้าเช็ดตัว 30*60"',            4,  6),
      ('Grand Family', 50, 'ผ้าเช็ดผม 15*30"',             4,  7),
      ('Grand Family', 50, 'ผ้าเช็ดเท้า Welcome',          2,  8),
      ('Grand Family', 50, 'ผ้าเช็ดมือ',                   2,  9),

      ('กลางบ้าน',    60, 'ผ้าเช็ดเท้า Welcome',           3,  1),

      ('ห้องน้ำกลาง', 70, 'ผ้าเช็ดเท้า Welcome',           2,  1),
      ('ห้องน้ำกลาง', 70, 'ผ้าเช็ดมือ',                    2,  2),

      ('โต๊ะกินข้าว', 80, 'ผ้าคลุมโต๊ะ',                   1,  1),

      ('ครัว',        90, 'ผ้าเช็ดเท้าครัว (สีดำ)',        2,  1),
      ('ครัว',        90, 'ผ้าเช็ดจาน',                    2,  2),
      ('ครัว',        90, 'ผ้าเช็ดมือ',                    2,  3)
    ) as t(room, room_order, item_name, qty, line_order)
    order by room_order, line_order
  loop
    -- หัวชุด (ห้องละใบ) — สร้างครั้งแรก, รันซ้ำล้างบรรทัดเดิมทิ้ง
    if v_room is distinct from r.room then
      v_room := r.room;

      select id into v_preset from public.tmc_stock_presets
       where org_id = v_org and preset_kind = 'checkout'
         and property_code = 'TMC7' and room_name = r.room;

      if v_preset is null then
        insert into public.tmc_stock_presets
          (org_id, name, preset_kind, property_code, room_name,
           source_location_id, sort_order, note)
        values
          (v_org, 'TMC7 — ' || r.room, 'checkout', 'TMC7', r.room,
           v_linen, r.room_order, 'ตั้งต้นจากที่เจ้าของไล่ของทางไฟล์เสียง 2026-07-31')
        returning id into v_preset;
      else
        delete from public.tmc_stock_preset_lines where preset_id = v_preset;
      end if;
    end if;

    select id into v_item from public.tmc_stock_items
     where org_id = v_org and name = r.item_name;

    if v_item is null then
      raise exception 'ไม่พบสินค้า "%" — seed หยุด (ห้องเป็นชุดที่ไม่ครบไม่ได้)', r.item_name;
    end if;

    insert into public.tmc_stock_preset_lines
      (preset_id, item_id, qty, qty_basis, sort_order)
    values (v_preset, v_item, r.qty, 'fixed', r.line_order);
  end loop;
end $$;

commit;
