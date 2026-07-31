-- TMC Stock v2 — P1 (ต่อ): จัดชั้นของเดิม 41 รายการ + นำเข้ารายการตั้งต้นจากไฟล์ Excel
-- spec: specs/tmc-stock-v2.md §7
--   ของใช้แม่บ้าน.xlsx            → consumable (amenity / cleaning / fnb) เข้า "คลังกลาง"
--   สต๊อกของงานก่อสร้าง_ผ้า.xlsx  → sheet "สต๊อกผ้า" คอลัมน์สรุป → reusable (linen / bedding) เข้า "ห้องผ้าสะอาด"
-- ยอดตั้งต้นบันทึกเป็น movement 'receive' โน้ต "ยอดยกมา (P1)" — ไม่มีการเขียนยอดตรง ๆ
-- idempotent: รันซ้ำได้ (unique ชื่อรายการ + ข้ามรายการที่มี movement แล้ว)

begin;

-- กันรายการชื่อซ้ำใน org เดียวกัน (RPC tmc_purchase_stock พึ่ง select-by-name อยู่แล้ว)
create unique index if not exists tmc_stock_items_org_name_key
  on public.tmc_stock_items(org_id, name);

-- ────────────────────────────────────────────────────────────────
-- 1. จัดชั้นของเดิมจากหมวดที่มีอยู่
-- ────────────────────────────────────────────────────────────────
update public.tmc_stock_items set
  stock_class = 'reusable', item_group = 'equipment', consumes_on_issue = false
where category in ('ของในครัว', 'อุปกรณ์ของใช้', 'อุปกรณ์')
   or name in ('ที่ซีนอาหาร');

update public.tmc_stock_items set
  stock_class = 'consumable', item_group = 'fnb'
where category in ('ของอาหารเช้า', 'อาหาร/เครื่องดื่ม')
  and stock_class = 'consumable';

update public.tmc_stock_items set
  stock_class = 'consumable', item_group = 'fnb', is_chargeable = true
where category = 'ไวน์';

update public.tmc_stock_items set item_group = 'cleaning'
where name in ('ถุงมือ') and stock_class = 'consumable';

update public.tmc_stock_items set
  stock_class = 'consumable', item_group = 'cleaning'
where category in ('ทำความสะอาด', 'ของใช้แม่บ้าน') and item_group is null;

update public.tmc_stock_items set
  stock_class = 'consumable', item_group = 'amenity'
where category in ('ของใช้ห้องน้ำ') and item_group is null;

update public.tmc_stock_items set
  stock_class = 'reusable', item_group = 'linen', consumes_on_issue = false
where category = 'ผ้า' and item_group is null;

-- ────────────────────────────────────────────────────────────────
-- 2. รายการใหม่จากไฟล์ตั้งต้น
-- ────────────────────────────────────────────────────────────────
with org as (select id from public.organizations where slug = 'tmc'),
seed(name, unit, category, stock_class, item_group) as (values
  -- ของใช้แม่บ้าน.xlsx
  ('เป็ดโปร',                      'ขวด',     'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('แฟบ',                          'ห่อ',     'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('ถุงขยะ 18*20',                 'ห่อ',     'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('ถุงขยะ 24*28',                 'ห่อ',     'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('ถุงขยะ 30*40',                 'ห่อ',     'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('กระดาษทิชชู่ม้วน',             'แพ็ก',    'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('กระดาษเช็ดมือ',                'ห่อ',     'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('กระดาษเช็ดหน้า',               'ห่อ',     'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('กาแฟสีแดง',                    'กล่อง',   'ของอาหารเช้า',  'consumable', 'fnb'),
  ('กาแฟสีฟ้า',                    'กล่อง',   'ของอาหารเช้า',  'consumable', 'fnb'),
  ('กาแฟสีน้ำตาล',                 'กล่อง',   'ของอาหารเช้า',  'consumable', 'fnb'),
  ('ไบก้อน',                       'กระป๋อง', 'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('สก๊อตไบร์ทล้างจาน',            'อัน',     'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('ฟองน้ำล้างแก้ว',               'อัน',     'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('แปรงสีฟัน',                    'อัน',     'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('หมวกคลุมอาบน้ำ',               'อัน',     'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('คัตเติลบัด',                   'อัน',     'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('น้ำยาซัลไล',                   'แกลอน',   'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('น้ำส้มสายชู',                  'แกลอน',   'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('น้ำยาดันฝุ่น',                 'แกลอน',   'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('สลิปเปอร์ ไซซ์ XL',            'คู่',     'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('สลิปเปอร์ ไซซ์ M',             'คู่',     'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('ไบโอเมท',                      'แกลอน',   'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('น้ำยาเช็ดกระจก',               'แกลอน',   'ของใช้แม่บ้าน', 'consumable', 'cleaning'),
  ('ครีมนวดผม',                    'แกลอน',   'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('น้ำหอมธรรมชาติ',               'แกลอน',   'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  ('ยาสระผม',                      'แกลอน',   'ของใช้ห้องน้ำ', 'consumable', 'amenity'),
  -- สต๊อกผ้า (ใช้ซ้ำ)
  ('ผ้าปูที่นอน 6 ฟุต (สูง 14")',  'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าปูที่นอน 5 ฟุต (สูง 14")',  'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าปูที่นอน 5 ฟุต (สูง 8")',   'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าปูที่นอน 3.5 ฟุต',          'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ปลอกผ้านวม King',              'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ปลอกผ้านวม Queen',             'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ปลอกผ้านวม Single',            'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ปลอกหมอนหนุน',                 'ใบ',  'ผ้า', 'reusable', 'linen'),
  ('ผ้าเช็ดตัว 30*60"',            'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าเช็ดตัว 40*60"',            'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าเช็ดตัวสระ',                'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าเช็ดผม 15*30"',             'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าเช็ดหน้า 12*12"',           'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าเช็ดมือ',                   'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าเช็ดเท้า Welcome',          'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าเย็น',                      'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ผ้าคลุมโต๊ะ',                  'ผืน', 'ผ้า', 'reusable', 'linen'),
  ('ไส้ผ้านวม King',               'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('ไส้ผ้านวม Queen',              'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('ไส้ผ้านวม Single',             'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('ผ้านวม 6 ฟุต',                 'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('ผ้านวม 5 ฟุต',                 'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('ผ้านวม 3.5 ฟุต',               'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('ผ้านวมขนห่านเทียม Queen',      'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('รองกันเปื้อนที่นอน',           'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('Topper 6 ฟุต',                 'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('Topper 5 ฟุต',                 'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('Topper 3.5 ฟุต',               'ผืน', 'ผ้า', 'reusable', 'bedding'),
  ('หมอนหนุนจัมโบ้ขนเป็ดเทียม',    'ใบ',  'ผ้า', 'reusable', 'bedding'),
  ('หมอนหนุนขนเป็ดเทียม',          'ใบ',  'ผ้า', 'reusable', 'bedding'),
  ('หมอนหนุนขนเป็ดเทียม 24*35"',   'ใบ',  'ผ้า', 'reusable', 'bedding'),
  ('หมอนหนุนขนเป็ดเทียม 19*29"',   'ใบ',  'ผ้า', 'reusable', 'bedding'),
  ('ถุงผ้าใบเล็ก',                 'ใบ',  'ผ้า', 'reusable', 'equipment'),
  ('ถุงผ้าใบใหญ่',                 'ใบ',  'ผ้า', 'reusable', 'equipment')
)
insert into public.tmc_stock_items
  (org_id, name, unit, category, stock_class, item_group, consumes_on_issue, min_quantity)
select org.id, s.name, s.unit, s.category, s.stock_class, s.item_group,
       (s.stock_class = 'consumable'), 0
from seed s cross join org
on conflict (org_id, name) do nothing;

-- ────────────────────────────────────────────────────────────────
-- 3. ยอดยกมา — ของเดิม (ยอดที่ค้างใน current_qty ก่อนเปลี่ยนโครง) เข้าคลังกลาง
-- ────────────────────────────────────────────────────────────────
insert into public.tmc_stock_movements
  (org_id, item_id, movement_type, quantity, to_location_id, reason, note)
select i.org_id, i.id, 'receive', i.current_qty, l.id, 'opening', 'ยอดยกมา (P1)'
from public.tmc_stock_items i
join public.tmc_stock_locations l on l.org_id = i.org_id and l.code = 'WH'
where i.current_qty > 0
  and not exists (select 1 from public.tmc_stock_movements m where m.item_id = i.id);

-- ────────────────────────────────────────────────────────────────
-- 4. ยอดยกมา — รายการจากไฟล์ Excel
--    consumable → คลังกลาง (WH) · ผ้า/ของใช้ซ้ำ → ห้องผ้าสะอาด (LINEN)
-- ────────────────────────────────────────────────────────────────
with org as (select id from public.organizations where slug = 'tmc'),
opening(name, qty) as (values
  ('เป็ดโปร', 3), ('แฟบ', 2), ('ถุงขยะ 18*20', 3), ('ถุงขยะ 24*28', 4), ('ถุงขยะ 30*40', 4),
  ('กระดาษทิชชู่ม้วน', 2), ('กระดาษเช็ดมือ', 14), ('กระดาษเช็ดหน้า', 27),
  ('กาแฟสีแดง', 11), ('กาแฟสีฟ้า', 10), ('กาแฟสีน้ำตาล', 8),
  ('ไบก้อน', 1), ('สก๊อตไบร์ทล้างจาน', 33), ('ฟองน้ำล้างแก้ว', 27),
  ('แปรงสีฟัน', 100), ('หมวกคลุมอาบน้ำ', 400), ('คัตเติลบัด', 241),
  ('น้ำยาซัลไล', 1), ('น้ำส้มสายชู', 2), ('น้ำยาดันฝุ่น', 1),
  ('สลิปเปอร์ ไซซ์ XL', 19), ('สลิปเปอร์ ไซซ์ M', 19),
  ('ไบโอเมท', 3), ('น้ำยาเช็ดกระจก', 1),
  ('ผ้าปูที่นอน 6 ฟุต (สูง 14")', 52), ('ผ้าปูที่นอน 5 ฟุต (สูง 14")', 5),
  ('ผ้าปูที่นอน 3.5 ฟุต', 8),
  ('ปลอกผ้านวม King', 51), ('ปลอกผ้านวม Queen', 15), ('ปลอกผ้านวม Single', 9),
  ('ปลอกหมอนหนุน', 163),
  ('ผ้าเช็ดตัว 30*60"', 232), ('ผ้าเช็ดตัว 40*60"', 36), ('ผ้าเช็ดตัวสระ', 8),
  ('ผ้าเช็ดผม 15*30"', 211), ('ผ้าเช็ดหน้า 12*12"', 108), ('ผ้าเช็ดมือ', 55),
  ('ผ้าเช็ดเท้า Welcome', 237), ('ผ้าเย็น', 4), ('ผ้าคลุมโต๊ะ', 67),
  ('ไส้ผ้านวม King', 5), ('ไส้ผ้านวม Queen', 14), ('ไส้ผ้านวม Single', 4),
  ('ผ้านวม 6 ฟุต', 1), ('ผ้านวมขนห่านเทียม Queen', 5),
  ('รองกันเปื้อนที่นอน', 18),
  ('Topper 6 ฟุต', 6), ('Topper 5 ฟุต', 4), ('Topper 3.5 ฟุต', 4),
  ('หมอนหนุนจัมโบ้ขนเป็ดเทียม', 52), ('หมอนหนุนขนเป็ดเทียม', 26),
  ('ถุงผ้าใบเล็ก', 1), ('ถุงผ้าใบใหญ่', 2)
)
insert into public.tmc_stock_movements
  (org_id, item_id, movement_type, quantity, to_location_id, reason, note)
select i.org_id, i.id, 'receive', o.qty, l.id, 'opening', 'ยอดยกมา (P1)'
from opening o
join org                            on true
join public.tmc_stock_items i       on i.org_id = org.id and i.name = o.name
join public.tmc_stock_locations l   on l.org_id = org.id
                                   and l.code = case when i.stock_class = 'reusable' then 'LINEN' else 'WH' end
where o.qty > 0
  and not exists (select 1 from public.tmc_stock_movements m where m.item_id = i.id);

commit;
